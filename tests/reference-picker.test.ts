import { describe, expect, it } from "vitest";
import { draftFromBrandPrice, searchBrandPrices } from "@/lib/reference-picker";
import { findBrandPrice } from "@/lib/reference-data";

describe("medicine picker mapping", () => {
  it("maps a single-salt catalog row with full confidence and no pack details", () => {
    const brand = findBrandPrice("Telma 40")!;
    const draft = draftFromBrandPrice(brand);
    expect(draft.brandName).toBe("Telma 40");
    expect(draft.salts).toEqual([
      { inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" },
    ]);
    expect(draft.fieldConfidence).toEqual({ brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 });
    expect(draft.expiryDate).toBeNull();
    expect(draft.batchNumber).toBeNull();
    expect(draft.displayGeneric).toBe("telmisartan");
  });

  it("splits a combination product's generic_name into separate salts", () => {
    const brand = findBrandPrice("Augmentin 625 Duo")!;
    const draft = draftFromBrandPrice(brand);
    expect(draft.salts.map((s) => s.inn)).toEqual(["amoxicillin", "clavulanic acid"]);
    expect(draft.salts.every((s) => s.strengthValue === null)).toBe(true);
    expect(draft.displayGeneric).toBe("amoxicillin + clavulanic acid");
  });

  it("flags a catalog entry containing a known high-risk salt", () => {
    const brand = findBrandPrice("Glycomet GP 1")!;
    const draft = draftFromBrandPrice(brand);
    expect(draft.highRisk).toBe(true);
    expect(draft.highRiskReason).toMatch(/hypoglycemia/i);
  });

  it("does not flag an ordinary catalog entry as high-risk", () => {
    const brand = findBrandPrice("Crocin 500")!;
    const draft = draftFromBrandPrice(brand);
    expect(draft.highRisk).toBe(false);
    expect(draft.highRiskReason).toBeNull();
  });

  it("searches by brand, generic name, and manufacturer", () => {
    expect(searchBrandPrices("azithral").map((b) => b.brandName)).toEqual(["Azithral 500"]);
    expect(searchBrandPrices("paracetamol").map((b) => b.brandName).sort()).toEqual([
      "Crocin 500",
      "Dolo 650",
      "Spasril",
    ]);
    expect(searchBrandPrices("cipla").map((b) => b.brandName).sort()).toEqual(["Foracort 200 Rotacap", "Warf 5"]);
    expect(searchBrandPrices("").length).toBeGreaterThanOrEqual(21);
  });
});
