import { describe, expect, it } from "vitest";
import { getAuthenticityCheck, findCatalogMatch } from "@/lib/authenticity";
import type { Salt } from "@/types/domain";

const salt = (inn: string, strengthValue: number | null = null, strengthUnit: Salt["strengthUnit"] = "mg"): Salt => ({
  inn,
  fdaSearchName: inn,
  strengthValue,
  strengthUnit,
});

describe("authenticity reference cross-check", () => {
  it("matches manufacturer and MRP within range for a well-recorded catalog brand", () => {
    const check = getAuthenticityCheck({
      brandName: "Telma 40",
      manufacturer: "Glenmark",
      mrpInr: 240,
      expiryDate: "2027-08",
      batchNumber: "B123",
      form: "tablet",
      salts: [salt("telmisartan", 40)],
    });
    expect(check.catalogMatch?.brandName).toBe("Telma 40");
    expect(check.catalogMatchExact).toBe(true);
    expect(check.manufacturerStatus).toBe("match");
    expect(check.mrpStatus).toBe("within_range");
    expect(check.expiryPresent).toBe(true);
    expect(check.batchPresent).toBe(true);
    expect(check.janAushadhi).toEqual({ genericName: "telmisartan", mrpInr: 10, packSize: 10 });
  });

  it("flags a manufacturer mismatch against the catalog", () => {
    const check = getAuthenticityCheck({
      brandName: "Telma 40",
      manufacturer: "Sun Pharma",
      mrpInr: 234,
      expiryDate: null,
      batchNumber: null,
      form: "tablet",
      salts: [salt("telmisartan", 40)],
    });
    expect(check.manufacturerStatus).toBe("mismatch");
    expect(check.expiryPresent).toBe(false);
    expect(check.batchPresent).toBe(false);
  });

  it("flags an MRP far outside the catalog's recorded band", () => {
    const check = getAuthenticityCheck({
      brandName: "Telma 40",
      manufacturer: "Glenmark",
      mrpInr: 500,
      expiryDate: null,
      batchNumber: null,
      form: "tablet",
      salts: [salt("telmisartan", 40)],
    });
    expect(check.mrpStatus).toBe("out_of_range");
  });

  it("reports unknown manufacturer/MRP status when those fields are blank", () => {
    const check = getAuthenticityCheck({
      brandName: "Telma 40",
      manufacturer: null,
      mrpInr: null,
      expiryDate: null,
      batchNumber: null,
      form: "tablet",
      salts: [salt("telmisartan", 40)],
    });
    expect(check.manufacturerStatus).toBe("unknown");
    expect(check.mrpStatus).toBe("unknown");
  });

  it("fuzzy-matches a brand name with minor punctuation differences", () => {
    const match = findCatalogMatch("telma-40");
    expect(match?.brand.brandName).toBe("Telma 40");
    expect(match?.exact).toBe(false);
  });

  it("finds no catalog match for an unrecognized brand", () => {
    const check = getAuthenticityCheck({
      brandName: "Totally Unknown Brand Xyz",
      manufacturer: "Someone",
      mrpInr: 50,
      expiryDate: null,
      batchNumber: null,
      form: "tablet",
      salts: [salt("someunknownsalt")],
    });
    expect(check.catalogMatch).toBeNull();
    expect(check.manufacturerStatus).toBe("unknown");
    expect(check.mrpStatus).toBe("unknown");
    expect(check.janAushadhi).toBeNull();
  });

  it("finds no Jan Aushadhi equivalent for a combination product not in that catalog", () => {
    const check = getAuthenticityCheck({
      brandName: "Augmentin 625 Duo",
      manufacturer: "GlaxoSmithKline",
      mrpInr: 223,
      expiryDate: null,
      batchNumber: null,
      form: "tablet",
      salts: [salt("amoxicillin"), salt("clavulanic acid")],
    });
    expect(check.janAushadhi).toBeNull();
  });
});
