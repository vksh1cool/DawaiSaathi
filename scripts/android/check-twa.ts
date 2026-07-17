import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ANDROID_PACKAGE_ID, PRODUCTION_ORIGIN, assert, loadTwaManifest } from "./twa-manifest";

const root = process.cwd();
const signingMarker = "// DawaiSaathi release signing (managed by scripts/android/sync-twa.ts)";

async function main() {
  const manifest = await loadTwaManifest(root);
  const [buildGradle, strings, embeddedWebManifest, sourceWebManifest] = await Promise.all([
    readFile(path.join(root, "android", "app", "build.gradle"), "utf8"),
    readFile(path.join(root, "android", "app", "src", "main", "res", "values", "strings.xml"), "utf8"),
    readFile(path.join(root, "android", "app", "src", "main", "res", "raw", "web_app_manifest.json"), "utf8"),
    readFile(path.join(root, "public", "manifest.webmanifest"), "utf8"),
  ]);

  const requiredGradleValues = [
    `applicationId: '${manifest.packageId}'`,
    `hostName: '${manifest.host}'`,
    `namespace "${manifest.packageId}"`,
    `applicationId "${manifest.packageId}"`,
    `versionCode ${manifest.appVersionCode}`,
    `versionName "${manifest.appVersion}"`,
    `minSdkVersion ${manifest.minSdkVersion}`,
    `webManifestUrl", '${manifest.webManifestUrl}'`,
    `fullScopeUrl", '${manifest.fullScopeUrl}'`,
    signingMarker,
  ];
  for (const value of requiredGradleValues) {
    assert(buildGradle.includes(value), `Generated Android build.gradle is out of sync: missing ${value}`);
  }
  assert(strings.includes(`\\"site\\": \\"${PRODUCTION_ORIGIN}\\"`), "Android asset statement must name the production Pages origin.");
  assert(JSON.stringify(JSON.parse(embeddedWebManifest)) === JSON.stringify(JSON.parse(sourceWebManifest)), "Embedded Android web manifest is stale. Run npm run android:sync.");

  await Promise.all(
    [
      path.join(root, "android", "gradlew"),
      path.join(root, "android", "gradle", "wrapper", "gradle-wrapper.jar"),
      path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"),
      path.join(root, "android", "app", "src", "main", "java", ...ANDROID_PACKAGE_ID.split("."), "LauncherActivity.java"),
      path.join(root, "public", "icons", "icon-192.png"),
      path.join(root, "public", "icons", "icon-512.png"),
      path.join(root, "public", "icons", "icon-512-maskable.png"),
      path.join(root, "src", "app", ".well-known", "assetlinks.json", "route.ts"),
    ].map((file) => access(file)),
  );

  process.stdout.write(`Android TWA source is valid for ${manifest.host}.\n`);
}

void main();
