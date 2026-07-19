import { prisma } from "@/lib/db";
import { parseSalts, parseFrequencyHint, parseStringArray } from "@/lib/db";
import { roundRupees } from "@/lib/util/money";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import type { GenericMatchResult, Salt } from "@/types/domain";
import type { Medication } from "@prisma/client";

import { findBestCandidate, brandUnitPrice } from "@/lib/generics-math";
export { findBestCandidate, brandUnitPrice } from "@/lib/generics-math";

export type GenericsRunResult = {
  matches: GenericMatchResult[];
  totalMonthlySavingsInr: number;
};

export async function runGenerics(patientId: string): Promise<GenericsRunResult> {
  if (usesSupabaseAuth()) {
    const { runSupabaseGenerics } = await import("@/lib/supabase/generics");
    return runSupabaseGenerics(patientId);
  }

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

    if (salts.length !== 1) {
      matches.push(await storeNoMatch(base));
      continue;
    }

    const cand = findBestCandidate(salts[0], med.form);
    if (!cand) {
      matches.push(await storeNoMatch(base));
      continue;
    }

    const brandUnit = brandUnitPrice(med.brandName, med.mrpInr, med.packSize);
    const jaUnit = cand.ja.mrpInr != null && cand.ja.packSize ? cand.ja.mrpInr / cand.ja.packSize : null;

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
  if (usesSupabaseAuth()) {
    const { getSupabaseGenerics } = await import("@/lib/supabase/generics");
    return getSupabaseGenerics();
  }

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
