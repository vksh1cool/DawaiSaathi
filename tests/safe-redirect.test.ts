import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/safe-redirect";

describe("safeInternalPath", () => {
  it("keeps normal internal paths, query strings, and fragments", () => {
    expect(safeInternalPath("/onboarding?step=2#voice")).toBe("/onboarding?step=2#voice");
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%5Cattacker.example",
    "javascript:alert(1)",
    "",
  ])("falls back for an unsafe redirect value: %s", (candidate) => {
    expect(safeInternalPath(candidate)).toBe("/");
  });
});
