import { readFile } from "node:fs/promises";
import path from "node:path";

export const ANDROID_PACKAGE_ID = "com.vksh1cool.dawaisaathi";
export const PRODUCTION_ORIGIN = "https://dawaisaathi.pages.dev";

export type DawaiSaathiTwaManifest = {
  packageId: string;
  host: string;
  name: string;
  launcherName: string;
  display: string;
  displayOverride: string[];
  themeColor: string;
  themeColorDark: string;
  navigationColor: string;
  navigationColorDark: string;
  navigationDividerColor: string;
  navigationDividerColorDark: string;
  backgroundColor: string;
  enableNotifications: boolean;
  startUrl: string;
  iconUrl: string;
  maskableIconUrl: string;
  splashScreenFadeOutDuration: number;
  signingKey: { path: string; alias: string };
  appVersionCode: number;
  appVersion: string;
  webManifestUrl: string;
  fullScopeUrl: string;
  fallbackType: "customtabs" | "webview";
  enableSiteSettingsShortcut: boolean;
  minSdkVersion: number;
  orientation: string;
  launchHandlerClientMode: string;
};

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  assert(typeof value === "string" && value.trim().length > 0, `${key} must be a non-empty string.`);
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  assert(typeof value === "boolean", `${key} must be a boolean.`);
  return value;
}

function requiredPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  assert(Number.isSafeInteger(value) && (value as number) > 0, `${key} must be a positive integer.`);
  return value as number;
}

function productionUrl(value: string, field: string, host: string): string {
  const url = new URL(value);
  assert(url.protocol === "https:" && url.host === host, `${field} must use the production HTTPS host.`);
  return url.toString();
}

/** Load and validate the canonical Android release manifest without a generator dependency. */
export async function loadTwaManifest(projectRoot = process.cwd()): Promise<DawaiSaathiTwaManifest> {
  const manifestPath = path.join(projectRoot, "android", "twa-manifest.json");
  const raw = asRecord(JSON.parse(await readFile(manifestPath, "utf8")), "twa-manifest.json");
  const packageId = requiredString(raw, "packageId");
  const host = requiredString(raw, "host");
  const displayOverride = raw.displayOverride;
  const signingKey = asRecord(raw.signingKey, "signingKey");

  assert(packageId === ANDROID_PACKAGE_ID, `packageId must remain ${ANDROID_PACKAGE_ID} once releases exist.`);
  assert(host === new URL(PRODUCTION_ORIGIN).host, "host must remain the clean Pages production domain.");
  assert(/^([A-Za-z][A-Za-z0-9_]*)(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageId), "packageId is not a valid Android application ID.");
  assert(Array.isArray(displayOverride) && displayOverride.every((entry) => typeof entry === "string"), "displayOverride must be a string array.");

  const manifest: DawaiSaathiTwaManifest = {
    packageId,
    host,
    name: requiredString(raw, "name"),
    launcherName: requiredString(raw, "launcherName"),
    display: requiredString(raw, "display"),
    displayOverride: displayOverride as string[],
    themeColor: requiredString(raw, "themeColor"),
    themeColorDark: requiredString(raw, "themeColorDark"),
    navigationColor: requiredString(raw, "navigationColor"),
    navigationColorDark: requiredString(raw, "navigationColorDark"),
    navigationDividerColor: requiredString(raw, "navigationDividerColor"),
    navigationDividerColorDark: requiredString(raw, "navigationDividerColorDark"),
    backgroundColor: requiredString(raw, "backgroundColor"),
    enableNotifications: requiredBoolean(raw, "enableNotifications"),
    startUrl: requiredString(raw, "startUrl"),
    iconUrl: productionUrl(requiredString(raw, "iconUrl"), "iconUrl", host),
    maskableIconUrl: productionUrl(requiredString(raw, "maskableIconUrl"), "maskableIconUrl", host),
    splashScreenFadeOutDuration: requiredPositiveInteger(raw, "splashScreenFadeOutDuration"),
    signingKey: { path: requiredString(signingKey, "path"), alias: requiredString(signingKey, "alias") },
    appVersionCode: requiredPositiveInteger(raw, "appVersionCode"),
    appVersion: requiredString(raw, "appVersion"),
    webManifestUrl: productionUrl(requiredString(raw, "webManifestUrl"), "webManifestUrl", host),
    fullScopeUrl: productionUrl(requiredString(raw, "fullScopeUrl"), "fullScopeUrl", host),
    fallbackType: requiredString(raw, "fallbackType") as "customtabs" | "webview",
    enableSiteSettingsShortcut: requiredBoolean(raw, "enableSiteSettingsShortcut"),
    minSdkVersion: requiredPositiveInteger(raw, "minSdkVersion"),
    orientation: requiredString(raw, "orientation"),
    launchHandlerClientMode: requiredString(raw, "launchHandlerClientMode"),
  };

  assert(manifest.startUrl.startsWith("/") && !manifest.startUrl.startsWith("//"), "startUrl must be a same-origin absolute path.");
  assert(manifest.display === "standalone", "display must be standalone for this TWA.");
  assert(manifest.fallbackType === "customtabs", "fallbackType must be customtabs; do not ship a WebView wrapper.");
  assert(/^\d+\.\d+\.\d+$/.test(manifest.appVersion), "appVersion must be X.Y.Z.");
  assert(manifest.appVersionCode <= 2_147_483_647, "appVersionCode exceeds Android's limit.");
  for (const color of [
    manifest.themeColor,
    manifest.themeColorDark,
    manifest.navigationColor,
    manifest.navigationColorDark,
    manifest.navigationDividerColor,
    manifest.navigationDividerColorDark,
    manifest.backgroundColor,
  ]) {
    assert(/^#[A-Fa-f0-9]{6}([A-Fa-f0-9]{2})?$/.test(color), "TWA colors must be hexadecimal CSS colors.");
  }
  return manifest;
}
