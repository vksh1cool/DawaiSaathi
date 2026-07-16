import { distance } from "fastest-levenshtein";
import { prisma } from "@/lib/db";
import { parseSalts, parseFrequencyHint, parseStringArray } from "@/lib/db";
import { getJanAushadhiProducts, findBrandPrice, type JaProduct } from "@/lib/reference-data";
import { roundRupees } from "@/lib/util/money";
import type { GenericMatchResult, Salt } from "@/types/domain";
import type { Medication } from "@prisma/client";

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

type Candidate = { ja: JaProduct; confidence: "high" | "medium" | "low" };

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

function brandUnitPrice(med: Medication): number | null {
  if (med.mrpInr != null && med.packSize) return med.mrpInr / med.packSize;
  const bp = findBrandPrice(med.brandName);
  if (bp?.mrpInr != null && bp.packSize) return bp.mrpInr / bp.packSize;
  return null;
}

export type GenericsRunResult = {
  matches: GenericMatchResult[];
  totalMonthlySavingsInr: number;
};

export async function runGenerics(patientId: string): Promise<GenericsRunResult> {
  const meds = await prisma.medication.findMany({
    where: { patientId, status: "active" },
    include: { schedules: { where: { active: true } } },
  });

  await prisma.genericMatch.deleteMany({
    where: { medication: { patientId } },
  });

  const matches: GenericMatchResult[] = [];
  let total = 0;

  for (const med of meds) {
    const salts = parseSalts(med);
    const base = { medicationId: med.id, brandName: med.brandName };

    // Combination products: no single-salt match in MVP (Data-Flow §4 step 1).
    if (salts.length !== 1) {
      matches.push(await storeNoMatch(base));
      continue;
    }

    const cand = findBestCandidate(salts[0], med.form);
    if (!cand) {
      matches.push(await storeNoMatch(base));
      continue;
    }

    const brandUnit = brandUnitPrice(med);
    const jaUnit = cand.ja.mrpInr != null && cand.ja.packSize ? cand.ja.mrpInr / cand.ja.packSize : null;

    // Monthly units from active schedule, else frequency hint (estimated).
    const schedule = med.schedules[0];
    const hint = parseFrequencyHint(med);
    let monthlyUnits: number | null = null;
    let estimated = false;
    if (schedule) {
      monthlyUnits = parseStringArray(schedule.timesJson).length * 30;
    } else if (hint?.timesPerDay) {
      monthlyUnits = hint.timesPerDay * 30;
      estimated = true;
    }

    let savings: number | null = null;
    if (brandUnit != null && jaUnit != null && monthlyUnits != null) {
      savings = roundRupees((brandUnit - jaUnit) * monthlyUnits);
    }

    const row = await prisma.genericMatch.create({
      data: {
        medicationId: med.id,
        jaProductCode: cand.ja.productCode,
        jaProductName: `${cand.ja.genericName} ${cand.ja.strengthValue ?? ""}${cand.ja.strengthUnit}`.trim(),
        jaPackSize: cand.ja.packSize,
        jaMrpInr: cand.ja.mrpInr,
        jaUnitPriceInr: jaUnit,
        brandUnitPriceInr: brandUnit,
        monthlySavingsInr: savings,
        confidence: cand.confidence,
        estimated,
      },
    });

    // Only high + medium confidence count toward the total (AC-6.1).
    if (savings != null && (cand.confidence === "high" || cand.confidence === "medium")) {
      total += savings;
    }

    matches.push(serializeMatch(row.id, base, row));
  }

  return { matches, totalMonthlySavingsInr: total };
}

async function storeNoMatch(base: { medicationId: string; brandName: string }): Promise<GenericMatchResult> {
  const row = await prisma.genericMatch.create({
    data: { medicationId: base.medicationId, jaProductName: null },
  });
  return {
    id: row.id,
    medicationId: base.medicationId,
    brandName: base.brandName,
    jaProductCode: null,
    jaProductName: null,
    jaPackSize: null,
    jaMrpInr: null,
    jaUnitPriceInr: null,
    brandUnitPriceInr: null,
    monthlySavingsInr: null,
    confidence: null,
    estimated: false,
  };
}

type GenericMatchRow = Awaited<ReturnType<typeof prisma.genericMatch.create>>;

function serializeMatch(
  id: string,
  base: { medicationId: string; brandName: string },
  row: GenericMatchRow,
): GenericMatchResult {
  return {
    id,
    medicationId: base.medicationId,
    brandName: base.brandName,
    jaProductCode: row.jaProductCode,
    jaProductName: row.jaProductName,
    jaPackSize: row.jaPackSize,
    jaMrpInr: row.jaMrpInr,
    jaUnitPriceInr: row.jaUnitPriceInr,
    brandUnitPriceInr: row.brandUnitPriceInr,
    monthlySavingsInr: row.monthlySavingsInr,
    confidence: row.confidence as "high" | "medium" | "low" | null,
    estimated: row.estimated,
  };
}

/** Rebuild the GenericsRunResult from stored rows (for GET). */
export async function getGenerics(patientId: string): Promise<GenericsRunResult> {
  const meds = await prisma.medication.findMany({
    where: { patientId, status: "active" },
    include: { genericMatches: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const matches: GenericMatchResult[] = [];
  let total = 0;
  for (const med of meds) {
    const row = med.genericMatches[0];
    if (!row) continue;
    const m = serializeMatch(row.id, { medicationId: med.id, brandName: med.brandName }, row);
    matches.push(m);
    if (m.monthlySavingsInr != null && (m.confidence === "high" || m.confidence === "medium")) {
      total += m.monthlySavingsInr;
    }
  }
  return { matches, totalMonthlySavingsInr: total };
}
