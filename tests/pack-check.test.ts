import { describe, expect, it } from "vitest";
import { getPackCheck } from "@/lib/pack-check";

const base = {
  brandName: "Telma 40",
  salts: [{ inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" as const }],
  expiryDate: "2027-12",
  batchNumber: "AB123",
  manufacturer: "Example Pharma",
  fieldConfidence: { brandName: 0.95, salts: 0.95, mrpInr: 0.95, expiryDate: 0.95 },
};

describe("pack integrity triage", () => {
  it("never calls a fully captured pack genuine", () => {
    expect(getPackCheck(base)).toEqual({ state: "details_captured", missing: [] });
  });

  it("asks for a clearer photo before acting on an uncertain expiry date", () => {
    expect(
      getPackCheck({ ...base, expiryDate: "2000-01", fieldConfidence: { ...base.fieldConfidence, expiryDate: 0.2 } }),
    ).toMatchObject({ state: "needs_clearer_photo" });
  });

  it("surfaces a confidently expired pack as an action state", () => {
    expect(getPackCheck({ ...base, expiryDate: "2000-01" })).toMatchObject({ state: "expired" });
  });

  it("lists identifiers that are absent without calling the pack fake", () => {
    expect(getPackCheck({ ...base, batchNumber: null, manufacturer: null })).toEqual({
      state: "needs_pack_details",
      missing: ["batch", "manufacturer"],
    });
  });
});
