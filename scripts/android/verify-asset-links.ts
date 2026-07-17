export {};

const fingerprint = process.env.ANDROID_APP_CERT_SHA256?.toUpperCase();
const origin = (process.env.PUBLIC_WEB_ORIGIN ?? "https://dawaisaathi.pages.dev").replace(/\/$/, "");
const packageName = "com.vksh1cool.dawaisaathi";
const SHA256_FINGERPRINT = /^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/;

if (!fingerprint || !SHA256_FINGERPRINT.test(fingerprint)) {
  throw new Error("ANDROID_APP_CERT_SHA256 must be a colon-separated SHA-256 certificate fingerprint.");
}

const url = new URL("/.well-known/assetlinks.json", origin);
const response = await fetch(url, { headers: { Accept: "application/json" }, redirect: "error" });
if (!response.ok) {
  throw new Error(`Asset Links verification failed with HTTP ${response.status}. Configure ANDROID_APP_CERT_SHA256 on the Worker before release.`);
}

const statements = (await response.json()) as unknown;
if (!Array.isArray(statements)) throw new Error("Asset Links response is not a statement array.");

const verified = statements.some((statement) => {
  if (!statement || typeof statement !== "object") return false;
  const target = (statement as { target?: { namespace?: unknown; package_name?: unknown; sha256_cert_fingerprints?: unknown } }).target;
  return (
    target?.namespace === "android_app" &&
    target.package_name === packageName &&
    Array.isArray(target.sha256_cert_fingerprints) &&
    target.sha256_cert_fingerprints.includes(fingerprint)
  );
});

if (!verified) throw new Error("Asset Links does not trust this Android package and signing certificate.");
process.stdout.write(`Asset Links verifies ${packageName} on ${url.origin}.\n`);
