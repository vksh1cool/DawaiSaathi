import { distance } from "fastest-levenshtein";
import { getBrandPrices, findBrandPrice, type BrandPrice } from "@/lib/reference-data";
import { findBestCandidate } from "@/lib/generics-math";
import type { Salt } from "@/types/domain";

/**
 * A reference cross-check against the bundled brand/Jan Aushadhi catalogs —
 * not a genuine-vs-counterfeit verdict. No live regulatory API exists for
 * Indian brands, so every result here is advisory and must ship alongside
 * `authenticity.disclaimer`.
 */

const MRP_TOLERANCE = 0.25;
const FUZZY_MAX_DISTANCE = 2;

const norm = (s: string) => s.trim().toLowerCase();

export type ManufacturerStatus = "match" | "mismatch" | "unknown";
export type MrpStatus = "within_range" | "out_of_range" | "unknown";

export type JanAushadhiNote = {
  genericName: string;
  mrpInr: number | null;
  packSize: number | null;
};

export type AuthenticityCheck = {
  catalogMatch: BrandPrice | null;
  catalogMatchExact: boolean;
  manufacturerStatus: ManufacturerStatus;
  mrpStatus: MrpStatus;
  expiryPresent: boolean;
  batchPresent: boolean;
  janAushadhi: JanAushadhiNote | null;
};

export type AuthenticityInput = {
  brandName: string | null;
  manufacturer: string | null;
  mrpInr: number | null;
  expiryDate: string | null;
  batchNumber: string | null;
  form: string;
  salts: Salt[];
};

/** Exact (case-insensitive) match first, then the closest catalog brand within edit-distance 2. */
export function findCatalogMatch(brandName: string | null): { brand: BrandPrice; exact: boolean } | null {
  if (!brandName?.trim()) return null;
  const exact = findBrandPrice(brandName);
  if (exact) return { brand: exact, exact: true };

  const target = norm(brandName);
  let best: BrandPrice | null = null;
  let bestDistance = Infinity;
  for (const candidate of getBrandPrices()) {
    const d = distance(target, norm(candidate.brandName));
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best && bestDistance <= FUZZY_MAX_DISTANCE ? { brand: best, exact: false } : null;
}

function findJanAushadhiNote(salts: Salt[], form: string): JanAushadhiNote | null {
  for (const salt of salts) {
    if (!salt.inn.trim()) continue;
    const candidate = findBestCandidate(salt, form);
    if (candidate) {
      return {
        genericName: candidate.ja.genericName,
        mrpInr: candidate.ja.mrpInr,
        packSize: candidate.ja.packSize,
      };
    }
  }
  return null;
}

export function getAuthenticityCheck(input: AuthenticityInput): AuthenticityCheck {
  const match = findCatalogMatch(input.brandName);

  let manufacturerStatus: ManufacturerStatus = "unknown";
  if (match && input.manufacturer?.trim()) {
    manufacturerStatus = norm(input.manufacturer) === norm(match.brand.manufacturer) ? "match" : "mismatch";
  }

  let mrpStatus: MrpStatus = "unknown";
  if (match?.brand.mrpInr != null && input.mrpInr != null) {
    const lo = match.brand.mrpInr * (1 - MRP_TOLERANCE);
    const hi = match.brand.mrpInr * (1 + MRP_TOLERANCE);
    mrpStatus = input.mrpInr >= lo && input.mrpInr <= hi ? "within_range" : "out_of_range";
  }

  return {
    catalogMatch: match?.brand ?? null,
    catalogMatchExact: match?.exact ?? false,
    manufacturerStatus,
    mrpStatus,
    expiryPresent: !!input.expiryDate?.trim(),
    batchPresent: !!input.batchNumber?.trim(),
    janAushadhi: findJanAushadhiNote(input.salts, input.form),
  };
}
