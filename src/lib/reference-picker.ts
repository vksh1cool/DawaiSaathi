import { getBrandPrices, lookupHighRisk, type BrandPrice } from "@/lib/reference-data";
import type { DraftMedication, MedForm, Salt, StrengthUnit } from "@/types/domain";

const VALID_FORMS: readonly MedForm[] = [
  "tablet",
  "capsule",
  "syrup",
  "drops",
  "injection",
  "cream",
  "other",
];
const VALID_UNITS: readonly Exclude<StrengthUnit, null>[] = [
  "mg",
  "mcg",
  "g",
  "iu",
  "ml_per_5ml",
  "mg_per_5ml",
];

function normalizeForm(form: string): MedForm {
  return (VALID_FORMS as readonly string[]).includes(form) ? (form as MedForm) : "other";
}

function normalizeUnit(unit: string): StrengthUnit {
  return (VALID_UNITS as readonly string[]).includes(unit) ? (unit as StrengthUnit) : null;
}

/**
 * The catalog stores one generic_name column, so a combination product (e.g.
 * "amoxicillin + clavulanic acid") is a single "+"-joined string. Split it
 * into individual salts here — the per-salt strength isn't tracked for
 * combos, so only the single-salt case keeps the catalog's strength/unit.
 */
function saltsFromGenericName(
  genericName: string,
  strengthValue: number | null,
  strengthUnit: StrengthUnit,
): Salt[] {
  const parts = genericName
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    const inn = parts[0] ?? genericName.trim();
    return [{ inn, fdaSearchName: inn, strengthValue, strengthUnit }];
  }
  return parts.map((inn) => ({ inn, fdaSearchName: inn, strengthValue: null, strengthUnit: null }));
}

function safetyFor(salts: Salt[]): { highRisk: boolean; highRiskReason: string | null } {
  for (const salt of salts) {
    const highRisk = lookupHighRisk(salt.inn);
    if (highRisk) return { highRisk: true, highRiskReason: highRisk.reasonEn };
  }
  return { highRisk: false, highRiskReason: null };
}

let pickerCounter = 0;

/**
 * A picker selection is authoritative catalog data, not an OCR guess — so
 * fieldConfidence is 1 throughout. Expiry and batch number are still null:
 * those live on the physical pack, not in a price catalog, and the existing
 * pack-check (src/lib/pack-check.ts) already asks the caregiver for them.
 */
export function draftFromBrandPrice(brand: BrandPrice): DraftMedication {
  const strengthUnit = normalizeUnit(brand.strengthUnit);
  const salts = saltsFromGenericName(brand.genericName, brand.strengthValue, strengthUnit);
  const safety = safetyFor(salts);
  pickerCounter += 1;
  return {
    tempId: `picker_${pickerCounter}_${brand.brandName.replace(/\s+/g, "_")}`,
    brandName: brand.brandName,
    salts,
    form: normalizeForm(brand.form),
    packSize: brand.packSize,
    mrpInr: brand.mrpInr,
    expiryDate: null,
    batchNumber: null,
    manufacturer: brand.manufacturer,
    fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
    warnings: [],
    highRisk: safety.highRisk,
    highRiskReason: safety.highRiskReason,
    usualFrequencyHint: null,
    displayGeneric: salts.map((salt) => salt.inn).join(" + "),
  };
}

export function searchBrandPrices(query: string): BrandPrice[] {
  const rows = getBrandPrices();
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (row) =>
      row.brandName.toLowerCase().includes(q) ||
      row.genericName.includes(q) ||
      row.manufacturer.toLowerCase().includes(q),
  );
}
