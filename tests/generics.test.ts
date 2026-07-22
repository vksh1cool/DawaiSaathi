import { describe, it, expect } from "vitest";
import { findBestCandidate } from "@/lib/generics";
import { brandUnitPrice, dedupeMatches } from "@/lib/generics-math";
import { roundRupees } from "@/lib/util/money";
import type { GenericMatchResult } from "@/types/domain";

const match = (over: Partial<GenericMatchResult>): GenericMatchResult => ({
  id: over.id ?? "m1",
  medicationId: over.medicationId ?? "med1",
  brandName: "Telma 40",
  jaProductCode: "JA001",
  jaProductName: "telmisartan 40mg",
  jaPackSize: 10,
  jaMrpInr: 16,
  jaUnitPriceInr: 1.6,
  brandUnitPriceInr: 5,
  monthlySavingsInr: 102,
  confidence: "high",
  estimated: false,
  ...over,
});

describe("brandUnitPrice (no hardcoded fallback)", () => {
  it("computes unit price from the medicine's own scanned MRP and pack size", () => {
    expect(brandUnitPrice(156, 30)).toBeCloseTo(156 / 30, 5);
  });

  it("returns null when MRP or pack size is missing — never a hardcoded estimate", () => {
    expect(brandUnitPrice(null, 30)).toBeNull();
    expect(brandUnitPrice(156, null)).toBeNull();
    expect(brandUnitPrice(null, null)).toBeNull();
  });
});

describe("dedupeMatches", () => {
  it("collapses duplicate medicines and never double-counts the monthly total", () => {
    const result = dedupeMatches([
      match({ id: "a", medicationId: "med1" }),
      match({ id: "b", medicationId: "med2" }), // same brand + generic → duplicate
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.totalMonthlySavingsInr).toBe(102); // counted once, not 204
  });

  it("keeps the higher-quality row when duplicates differ", () => {
    const result = dedupeMatches([
      match({ id: "poor", jaProductName: null, monthlySavingsInr: null, confidence: null }),
      match({ id: "rich" }),
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.id).toBe("rich");
  });

  it("keeps genuinely different medicines separate", () => {
    const result = dedupeMatches([
      match({ id: "a", brandName: "Telma 40", jaProductName: "telmisartan 40mg" }),
      match({ id: "b", brandName: "Amlong 5", jaProductName: "amlodipine 5mg" }),
    ]);
    expect(result.matches).toHaveLength(2);
    expect(result.totalMonthlySavingsInr).toBe(204);
  });
});

describe("Generics Matching Logic", () => {
  it("selects the exact salt, strength, and form as a high-confidence match", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" },
      "tablet",
    );
    expect(match?.ja.productCode).toBe("JA001");
    expect(match?.confidence).toBe("high");
  });

  it("demotes a strength match with a different form to medium confidence", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" },
      "capsule",
    );
    expect(match?.confidence).toBe("medium");
  });

  it("does not suggest a different known strength as a low-confidence alternative", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 20, strengthUnit: "mg" },
      "tablet",
    );
    expect(match).toBeNull();
  });

  it("keeps salt-only extraction visibly low confidence", () => {
    const match = findBestCandidate(
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: null, strengthUnit: null },
      "tablet",
    );
    expect(match?.confidence).toBe("low");
  });

  it("rounds savings and never claims a negative saving", () => {
    expect(roundRupees((7.8 - 1) * 30)).toBe(204);
    expect(roundRupees(-24.2)).toBe(0);
  });
});
