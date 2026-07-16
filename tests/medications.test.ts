import { describe, expect, it } from "vitest";
import {
  canonicalizeSalts,
  displayGenericForSalts,
  draftToCreateData,
  medicationSafety,
} from "@/lib/medications";
import type { DraftMedication } from "@/types/domain";

describe("Medication persistence safety boundary", () => {
  it("canonicalizes caregiver edits and restores a high-risk warning from the reference data", () => {
    const salts = canonicalizeSalts([
      { inn: " Warfarin ", fdaSearchName: "", strengthValue: 5, strengthUnit: "mg" },
    ]);
    expect(salts[0]).toMatchObject({ inn: "warfarin", fdaSearchName: "warfarin" });
    expect(medicationSafety(salts)).toMatchObject({ highRisk: true });
    expect(displayGenericForSalts(salts)).toBe("warfarin");
  });

  it("never trusts a client trying to clear a high-risk flag", () => {
    const draft: DraftMedication = {
      tempId: "draft",
      brandName: "Warf 5",
      salts: [{ inn: "warfarin", fdaSearchName: "warfarin", strengthValue: 5, strengthUnit: "mg" }],
      form: "tablet",
      packSize: 30,
      mrpInr: 128,
      expiryDate: null,
      batchNumber: null,
      manufacturer: null,
      fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
      warnings: [],
      highRisk: false,
      highRiskReason: null,
      usualFrequencyHint: { timesPerDay: 1, timing: ["evening"] },
      displayGeneric: "something stale",
    };

    const data = draftToCreateData(draft, "patient");
    expect(data.highRisk).toBe(true);
    expect(data.highRiskReason).toContain("bleeding");
    expect(data.displayGeneric).toBe("warfarin");
  });
});
