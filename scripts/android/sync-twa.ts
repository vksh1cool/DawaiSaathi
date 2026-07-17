import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assert, loadTwaManifest } from "./twa-manifest";

const root = process.cwd();
const signingMarker = "// DawaiSaathi release signing (managed by scripts/android/sync-twa.ts)";

function escapeGroovy(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function replaceOne(source: string, pattern: RegExp, replacement: string, label: string): string {
  assert(pattern.test(source), `Generated Android build.gradle is missing ${label}.`);
  return source.replace(pattern, replacement);
}

async function main() {
  const manifest = await loadTwaManifest(root);
  const buildGradlePath = path.join(root, "android", "app", "build.gradle");
  const embeddedWebManifestPath = path.join(root, "android", "app", "src", "main", "res", "raw", "web_app_manifest.json");
  const sourceWebManifestPath = path.join(root, "public", "manifest.webmanifest");
  let buildGradle = await readFile(buildGradlePath, "utf8");

  assert(buildGradle.includes(signingMarker), "Release signing guard is missing. Restore the checked-in Android source before releasing.");
  const replacements: Array<[RegExp, string, string]> = [
    [/applicationId: '[^']*'/, `applicationId: '${escapeGroovy(manifest.packageId)}'`, "twa applicationId"],
    [/hostName: '[^']*'/, `hostName: '${escapeGroovy(manifest.host)}'`, "twa hostName"],
    [/launchUrl: '[^']*'/, `launchUrl: '${escapeGroovy(manifest.startUrl)}'`, "twa launchUrl"],
    [/name: '[^']*'/, `name: '${escapeGroovy(manifest.name)}'`, "twa name"],
    [/launcherName: '[^']*'/, `launcherName: '${escapeGroovy(manifest.launcherName)}'`, "twa launcherName"],
    [/themeColor: '[^']*'/, `themeColor: '${manifest.themeColor}'`, "twa themeColor"],
    [/themeColorDark: '[^']*'/, `themeColorDark: '${manifest.themeColorDark}'`, "twa themeColorDark"],
    [/navigationColor: '[^']*'/, `navigationColor: '${manifest.navigationColor}'`, "twa navigationColor"],
    [/navigationColorDark: '[^']*'/, `navigationColorDark: '${manifest.navigationColorDark}'`, "twa navigationColorDark"],
    [/navigationDividerColor: '[^']*'/, `navigationDividerColor: '${manifest.navigationDividerColor}'`, "twa navigationDividerColor"],
    [/navigationDividerColorDark: '[^']*'/, `navigationDividerColorDark: '${manifest.navigationDividerColorDark}'`, "twa navigationDividerColorDark"],
    [/backgroundColor: '[^']*'/, `backgroundColor: '${manifest.backgroundColor}'`, "twa backgroundColor"],
    [/enableNotifications: (true|false)/, `enableNotifications: ${manifest.enableNotifications}`, "twa enableNotifications"],
    [/splashScreenFadeOutDuration: \d+/, `splashScreenFadeOutDuration: ${manifest.splashScreenFadeOutDuration}`, "twa splash duration"],
    [/fallbackType: '[^']*'/, `fallbackType: '${manifest.fallbackType}'`, "twa fallback type"],
    [/orientation: '[^']*'/, `orientation: '${manifest.orientation}'`, "twa orientation"],
    [/namespace "[^"]+"/, `namespace "${manifest.packageId}"`, "Android namespace"],
    [/applicationId "[^"]+"/, `applicationId "${manifest.packageId}"`, "Android applicationId"],
    [/minSdkVersion \d+/, `minSdkVersion ${manifest.minSdkVersion}`, "Android minSdkVersion"],
    [/versionCode \d+/, `versionCode ${manifest.appVersionCode}`, "Android versionCode"],
    [/versionName "[^"]+"/, `versionName "${manifest.appVersion}"`, "Android versionName"],
    [/resValue "string", "launchHandlerClientMode", '[^']*'/, `resValue "string", "launchHandlerClientMode", '${manifest.launchHandlerClientMode}'`, "launch handler"],
    [/resValue "string", "webManifestUrl", '[^']*'/, `resValue "string", "webManifestUrl", '${manifest.webManifestUrl}'`, "web manifest URL"],
    [/resValue "string", "fullScopeUrl", '[^']*'/, `resValue "string", "fullScopeUrl", '${manifest.fullScopeUrl}'`, "full scope URL"],
  ];
  for (const [pattern, replacement, label] of replacements) {
    buildGradle = replaceOne(buildGradle, pattern, replacement, label);
  }

  const sourceWebManifest = JSON.parse(await readFile(sourceWebManifestPath, "utf8"));
  await Promise.all([
    writeFile(buildGradlePath, buildGradle, "utf8"),
    writeFile(embeddedWebManifestPath, JSON.stringify(sourceWebManifest), "utf8"),
  ]);
  process.stdout.write("Android TWA source synchronized. Release builds require all four ANDROID_KEY* variables.\n");
}

void main();
