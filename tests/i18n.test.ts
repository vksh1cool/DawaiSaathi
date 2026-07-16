import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en.json";
import hi from "@/lib/i18n/hi.json";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  it("keeps Hindi and English message keys in sync", () => {
    expect(leafKeys(hi).sort()).toEqual(leafKeys(en).sort());
  });
});
