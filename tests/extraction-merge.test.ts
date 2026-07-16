import { describe, it, expect } from "vitest";
import { mergeMedications, type RawMed } from "@/lib/extraction";

describe("Vision OCR Extraction & Merge", () => {
  it("merges front and back records using the strongest readable fields", () => {
    const front: RawMed = {
      brandName: "Telma 40",
      composition: [{ saltNameAsPrinted: "Telmisartan IP", strengthValue: 40, strengthUnit: "mg" }],
      form: "tablet",
      packSize: null,
      mrpInr: null,
      expiryDate: null,
      batchNumber: null,
      manufacturer: null,
      fieldConfidence: { brandName: 0.98, composition: 0.72, mrpInr: 0.1, expiryDate: 0.1 },
      warnings: ["MRP not visible"],
    };
    const back: RawMed = {
      ...front,
      brandName: null,
      packSize: 30,
      mrpInr: 234,
      expiryDate: "2027-08",
      fieldConfidence: { brandName: 0.1, composition: 0.95, mrpInr: 0.95, expiryDate: 0.94 },
      warnings: ["back foil used"],
    };

    const [merged] = mergeMedications([front, back]);

    expect(merged.brandName).toBe("Telma 40");
    expect(merged.mrpInr).toBe(234);
    expect(merged.expiryDate).toBe("2027-08");
    expect(merged.packSize).toBe(30);
    expect(merged.warnings).toEqual(["MRP not visible", "back foil used"]);
  });

  it("does not merge different strengths under the same brand", () => {
    const med = (strengthValue: number): RawMed => ({
      brandName: "Example",
      composition: [{ saltNameAsPrinted: "Example salt", strengthValue, strengthUnit: "mg" }],
      form: "tablet",
      packSize: null,
      mrpInr: null,
      expiryDate: null,
      batchNumber: null,
      manufacturer: null,
      fieldConfidence: { brandName: 1, composition: 1, mrpInr: 1, expiryDate: 1 },
      warnings: [],
    });
    expect(mergeMedications([med(10), med(20)])).toHaveLength(2);
  });

  it("does not merge combination medicines when a non-primary strength differs", () => {
    const combo = (secondStrength: number): RawMed => ({
      brandName: "Example Combo",
      composition: [
        { saltNameAsPrinted: "Salt A", strengthValue: 500, strengthUnit: "mg" },
        { saltNameAsPrinted: "Salt B", strengthValue: secondStrength, strengthUnit: "mg" },
      ],
      form: "tablet",
      packSize: null,
      mrpInr: null,
      expiryDate: null,
      batchNumber: null,
      manufacturer: null,
      fieldConfidence: { brandName: 1, composition: 1, mrpInr: 1, expiryDate: 1 },
      warnings: [],
    });

    expect(mergeMedications([combo(5), combo(10)])).toHaveLength(2);
  });
});
