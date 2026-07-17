import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/en.json";
import es from "@/lib/i18n/es.json";
import hi from "@/lib/i18n/hi.json";
import { APP_LANGUAGE_CODES, dictionaries } from "@/lib/i18n";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [prefix];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("i18n dictionaries", () => {
  it("keeps translated message keys in sync", () => {
    expect(leafKeys(hi).sort()).toEqual(leafKeys(en).sort());
    expect(leafKeys(es).sort()).toEqual(leafKeys(en).sort());
  });

  it("has a checked-in dictionary for every app language", () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...APP_LANGUAGE_CODES].sort());
  });
});
