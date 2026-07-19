import { distance } from "fastest-levenshtein";
import { getJanAushadhiProducts, findBrandPrice, type JaProduct } from "@/lib/reference-data";
import type { Salt } from "@/types/domain";

/** Jan Aushadhi generic matching + savings math (PRD F4, Data-Flow §4). Deterministic, no LLM. */

const strengthUnitNorm = (u: string | null) => (u ?? "").toLowerCase().replace(/\s+/g, "");

function saltMatches(inn: string, ja: JaProduct): boolean {
  return distance(inn.toLowerCase(), ja.genericName.toLowerCase()) <= 2;
}

function strengthMatches(salt: Salt, ja: JaProduct): boolean {
  if (salt.strengthValue == null || ja.strengthValue == null) return false;
  return (
    Math.abs(salt.strengthValue - ja.strengthValue) < 0.001 &&
    strengthUnitNorm(salt.strengthUnit) === strengthUnitNorm(ja.strengthUnit)
  );
}

export type Candidate = { ja: JaProduct; confidence: "high" | "medium" | "low" };

/** Pick the best Jan Aushadhi candidate for a single-salt medicine. */
export function findBestCandidate(salt: Salt, form: string): Candidate | null {
  const saltCandidates = getJanAushadhiProducts().filter((ja) => saltMatches(salt.inn, ja));
  if (saltCandidates.length === 0) return null;

  const exactStrength = saltCandidates.filter((ja) => strengthMatches(salt, ja));
  if (exactStrength.length > 0) {
    const sameForm = exactStrength.find((ja) => ja.form === form.toLowerCase());
    return { ja: sameForm ?? exactStrength[0]!, confidence: sameForm ? "high" : "medium" };
  }

  // A known strength that does not match is not an alternative at all. A
  // muted low-confidence row is reserved for genuinely salt-only extraction,
  // never for a product at a different known dose.
  if (salt.strengthValue != null || salt.strengthUnit != null) return null;

  const sameForm = saltCandidates.find((ja) => ja.form === form.toLowerCase());
  return { ja: sameForm ?? saltCandidates[0]!, confidence: "low" };
}

export function brandUnitPrice(brandName: string, mrpInr: number | null, packSize: number | null): number | null {
  if (mrpInr != null && packSize) return mrpInr / packSize;
  const bp = findBrandPrice(brandName);
  if (bp?.mrpInr != null && bp.packSize) return bp.mrpInr / bp.packSize;
  return null;
}
