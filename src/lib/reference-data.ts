import type { Severity } from "@/types/domain";
import { referenceRows } from "@/lib/reference-data.generated";

/** In-memory, file-backed reference tables (Data-Flow §10). Loaded once, memoized. */

export type CuratedInteraction = {
  saltA: string;
  saltB: string;
  severity: Severity;
  mechanismEn: string;
  explanationEn: string;
  explanationHi: string;
  actionEn: string;
  actionHi: string;
};

export type JaProduct = {
  productCode: string;
  genericName: string;
  strengthValue: number | null;
  strengthUnit: string;
  form: string;
  packSize: number | null;
  mrpInr: number | null;
};

export type BrandPrice = {
  brandName: string;
  manufacturer: string;
  genericName: string;
  strengthValue: number | null;
  strengthUnit: string;
  form: string;
  packSize: number | null;
  mrpInr: number | null;
};

export type HighRiskMed = {
  salt: string;
  reasonEn: string;
  reasonHi: string;
  specialCheck: string; // "none" | "weekly_check"
};

let _curated: CuratedInteraction[] | null = null;
let _ja: JaProduct[] | null = null;
let _brands: BrandPrice[] | null = null;
let _highRisk: Map<string, HighRiskMed> | null = null;

const norm = (s: string) => s.trim().toLowerCase();
const num = (value: string | undefined | null): number | null => {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};
const intOrNull = (value: string | undefined | null): number | null => {
  const parsed = num(value);
  return parsed === null ? null : Math.round(parsed);
};

export function getCuratedInteractions(): CuratedInteraction[] {
  if (_curated) return _curated;
  const rows = referenceRows.curated_interactions;
  _curated = rows.map((r) => ({
    saltA: norm(r.salt_a),
    saltB: norm(r.salt_b),
    severity: r.severity.trim() as Severity,
    mechanismEn: r.mechanism_en,
    explanationEn: r.explanation_en,
    explanationHi: r.explanation_hi,
    actionEn: r.action_en,
    actionHi: r.action_hi,
  }));
  return _curated;
}

/** Unordered lookup of a curated interaction between two salts. */
export function findCuratedInteraction(
  a: string,
  b: string,
): CuratedInteraction | undefined {
  const x = norm(a);
  const y = norm(b);
  return getCuratedInteractions().find(
    (c) => (c.saltA === x && c.saltB === y) || (c.saltA === y && c.saltB === x),
  );
}

export function getJanAushadhiProducts(): JaProduct[] {
  if (_ja) return _ja;
  const rows = referenceRows.janaushadhi_products;
  _ja = rows.map((r) => ({
    productCode: r.product_code.trim(),
    genericName: norm(r.generic_name),
    strengthValue: num(r.strength_value),
    strengthUnit: norm(r.strength_unit),
    form: norm(r.form),
    packSize: intOrNull(r.pack_size),
    mrpInr: num(r.mrp_inr),
  }));
  return _ja;
}

export function getBrandPrices(): BrandPrice[] {
  if (_brands) return _brands;
  const rows = referenceRows.brand_prices;
  _brands = rows.map((r) => ({
    brandName: r.brand_name.trim(),
    manufacturer: r.manufacturer.trim(),
    genericName: norm(r.generic_name),
    strengthValue: num(r.strength_value),
    strengthUnit: norm(r.strength_unit),
    form: norm(r.form),
    packSize: intOrNull(r.pack_size),
    mrpInr: num(r.mrp_inr),
  }));
  return _brands;
}

/** Brand price lookup by brand name (case-insensitive exact). */
export function findBrandPrice(brandName: string): BrandPrice | undefined {
  const target = norm(brandName);
  return getBrandPrices().find((b) => norm(b.brandName) === target);
}

export function getHighRiskMeds(): Map<string, HighRiskMed> {
  if (_highRisk) return _highRisk;
  const rows = referenceRows.highrisk_meds;
  _highRisk = new Map();
  for (const r of rows) {
    const salt = norm(r.salt);
    _highRisk.set(salt, {
      salt,
      reasonEn: r.reason_en,
      reasonHi: r.reason_hi,
      specialCheck: (r.special_check ?? "none").trim() || "none",
    });
  }
  return _highRisk;
}

/** Returns the high-risk record for a salt (matches prefixes like "insulin glargine"). */
export function lookupHighRisk(inn: string): HighRiskMed | undefined {
  const map = getHighRiskMeds();
  const n = norm(inn);
  if (map.has(n)) return map.get(n);
  // Prefix match for families (e.g. "insulin glargine" → "insulin").
  for (const [salt, rec] of map) {
    if (n.startsWith(salt + " ") || n === salt) return rec;
  }
  return undefined;
}

/** Test/dev only: clear memoized tables. */
export function _resetReferenceCache() {
  _curated = _ja = _brands = null;
  _highRisk = null;
}
