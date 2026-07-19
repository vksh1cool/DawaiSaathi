import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

describe("Cloudflare public gateway", () => {
  it("keeps the Pages hostname canonical for the Android TWA", () => {
    const middleware = readFileSync(resolve(root, "src/middleware.ts"), "utf8");
    const twaManifest = readFileSync(resolve(root, "android/twa-manifest.json"), "utf8");
    const gateway = readFileSync(resolve(root, "pages-gateway/_worker.js"), "utf8");

    expect(twaManifest).toContain('"host": "dawaisaathi.pages.dev"');
    expect(gateway).toContain("DAWAISAATHI_APP.fetch(request)");
    expect(middleware).not.toContain('hostname.endsWith(".pages.dev")');
    expect(middleware).not.toContain("dawaisaathi.vksh1cool.workers.dev");
  });
});
