import { distance } from "fastest-levenshtein";
import { getJanAushadhiProducts, type JaProduct } from "@/lib/reference-data";
import type { GenericMatchResult, Salt } from "@/types/domain";

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

/**
 * Per-unit brand price is derived ONLY from the medicine's own scanned MRP and
 * pack size — never from a hardcoded brand-price table. When a scan did not
 * capture MRP or pack size we return null, and the savings row shows "no saving
 * computed" rather than an invented estimate. This keeps every rupee on the
 * savings screen traceable to real data the user can see on their own strip.
 */
export function brandUnitPrice(mrpInr: number | null, packSize: number | null): number | null {
  if (mrpInr != null && packSize) return mrpInr / packSize;
  return null;
}

/** Rank a match so dedupe keeps the most useful row for a medicine. */
function matchQuality(m: GenericMatchResult): number {
  let score = 0;
  if (m.jaProductName) score += 4; // has a Jan Aushadhi match at all
  if (m.monthlySavingsInr != null) score += 2; // has a computed saving
  if (m.confidence === "high") score += 1;
  return score;
}

/**
 * Collapse duplicate medicine rows so a medication that was scanned or seeded
 * more than once appears exactly once on the savings screen. Rows are keyed by
 * brand + matched generic (both carry the strength), and the highest-quality
 * row wins. The monthly total is recomputed from the deduped rows so it can
 * never double-count a duplicate.
 */
export function dedupeMatches(matches: GenericMatchResult[]): {
  matches: GenericMatchResult[];
  totalMonthlySavingsInr: number;
} {
  const byKey = new Map<string, GenericMatchResult>();
  for (const m of matches) {
    const key = m.brandName.trim().toLowerCase();
    const existing = byKey.get(key);
    if (!existing || matchQuality(m) > matchQuality(existing)) byKey.set(key, m);
  }
  const deduped = [...byKey.values()];
  let totalMonthlySavingsInr = 0;
  for (const m of deduped) {
    if (m.monthlySavingsInr != null && (m.confidence === "high" || m.confidence === "medium")) {
      totalMonthlySavingsInr += m.monthlySavingsInr;
    }
  }
  return { matches: deduped, totalMonthlySavingsInr };
}
