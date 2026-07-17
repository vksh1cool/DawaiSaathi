import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const versionInput = process.argv[2] ?? process.env.GITHUB_REF_NAME;
const match = versionInput?.match(/^v?(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
  throw new Error("Provide a release version as vMAJOR.MINOR.PATCH (for example, v1.2.3).");
}

const [, majorText, minorText, patchText] = match;
const major = Number(majorText);
const minor = Number(minorText);
const patch = Number(patchText);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2_147_483_647) {
  throw new Error("Version is outside Android's supported versionCode range.");
}

const manifestPath = path.join(process.cwd(), "android", "twa-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
manifest.appVersion = `${major}.${minor}.${patch}`;
manifest.appVersionCode = versionCode;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`Android version set to ${manifest.appVersion} (${versionCode}).\n`);
