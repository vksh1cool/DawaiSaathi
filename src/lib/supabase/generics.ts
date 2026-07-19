import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { AppError } from "@/lib/errors";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { roundRupees } from "@/lib/util/money";
import type { GenericMatchResult, Salt } from "@/types/domain";

import { findBestCandidate, brandUnitPrice } from "@/lib/generics-math";

export async function getSupabaseGenerics() {
  const supabase = await createSupabaseServerClient();
  const household = await getSupabaseHousehold(supabase);
  if (!household?.patient) throw new AppError("NOT_FOUND", "No patient found.");

  // Fetch medications with their generic matches
  const { data: meds, error } = await supabase
    .from("medications")
    .select(`
      id, brand_name,
      generic_matches (
        id, ja_product_code, ja_product_name, ja_pack_size, ja_mrp_inr, ja_unit_price_inr, brand_unit_price_inr, monthly_savings_inr, confidence, estimated
      )
    `)
    .eq("patient_id", household.patient.id)
    .eq("status", "active");

  if (error) supabaseDatabaseError("load generic matches", error.code);

  const matches: GenericMatchResult[] = [];
  let total = 0;

  for (const med of meds || []) {
    const row = med.generic_matches && med.generic_matches.length > 0 ? med.generic_matches[0] : null;
    if (!row) continue;

    matches.push({
      id: row.id,
      medicationId: med.id,
      brandName: med.brand_name,
      jaProductCode: row.ja_product_code,
      jaProductName: row.ja_product_name,
      jaPackSize: typeof row.ja_pack_size === "number" ? row.ja_pack_size : row.ja_pack_size == null ? null : Number(row.ja_pack_size),
      jaMrpInr: row.ja_mrp_inr,
      jaUnitPriceInr: row.ja_unit_price_inr,
      brandUnitPriceInr: row.brand_unit_price_inr,
      monthlySavingsInr: row.monthly_savings_inr,
      confidence: row.confidence as "high" | "medium" | "low" | null,
      estimated: row.estimated ?? false,
    });

    if (row.monthly_savings_inr != null && (row.confidence === "high" || row.confidence === "medium")) {
      total += row.monthly_savings_inr;
    }
  }

  return { matches, totalMonthlySavingsInr: total };
}

export async function runSupabaseGenerics(patientId: string) {
  const supabase = await createSupabaseServerClient();
  const household = await getSupabaseHousehold(supabase);
  if (!household?.patient) throw new AppError("NOT_FOUND", "No patient found.");

  // For this, we need medications with schedules to calculate usage
  const { data: meds, error } = await supabase
    .from("medications")
    .select(`
      id, brand_name, display_generic, salts, form, pack_size, mrp_inr, usual_frequency_hint,
      schedules ( times_json, active )
    `)
    .eq("patient_id", household.patient.id)
    .eq("status", "active");

  if (error) supabaseDatabaseError("load medications for generics", error.code);

  const matches: GenericMatchResult[] = [];
  let total = 0;

  if (meds) {
      for (const med of meds) {
        await supabase.from("generic_matches").delete().eq("medication_id", med.id);
      }
  }

  for (const med of meds || []) {
    const salts = Array.isArray(med.salts) ? (med.salts as Salt[]) : [];
    const base = { medicationId: med.id, brandName: med.brand_name };

    if (salts.length !== 1) {
      matches.push(await storeSupabaseNoMatch(supabase, base));
      continue;
    }

    const cand = findBestCandidate(salts[0], med.form);
    if (!cand) {
      matches.push(await storeSupabaseNoMatch(supabase, base));
      continue;
    }

    const brandUnit = brandUnitPrice(med.brand_name, med.mrp_inr, med.pack_size);
    const jaUnit = cand.ja.mrpInr != null && cand.ja.packSize ? cand.ja.mrpInr / cand.ja.packSize : null;

    const activeSchedules = med.schedules?.filter(s => s.active) || [];
    const schedule = activeSchedules[0];
    const hint = med.usual_frequency_hint as { timesPerDay?: number } | null;

    let monthlyUnits: number | null = null;
    let estimated = false;
    if (schedule && schedule.times_json) {
        try {
            const times = Array.isArray(schedule.times_json) ? schedule.times_json : JSON.parse(schedule.times_json as string);
            monthlyUnits = times.length * 30;
        } catch {
            monthlyUnits = null;
        }
    } else if (hint?.timesPerDay) {
      monthlyUnits = hint.timesPerDay * 30;
      estimated = true;
    }

    let savings: number | null = null;
    if (brandUnit != null && jaUnit != null && monthlyUnits != null) {
      savings = roundRupees((brandUnit - jaUnit) * monthlyUnits);
    }

    const { data: row, error: insertError } = await supabase.from("generic_matches").insert({
      medication_id: med.id,
      ja_product_code: cand.ja.productCode,
      ja_product_name: `${cand.ja.genericName} ${cand.ja.strengthValue ?? ""}${cand.ja.strengthUnit}`.trim(),
      ja_pack_size: cand.ja.packSize,
      ja_mrp_inr: cand.ja.mrpInr,
      ja_unit_price_inr: jaUnit,
      brand_unit_price_inr: brandUnit,
      monthly_savings_inr: savings,
      confidence: cand.confidence,
      estimated
    }).select().single();

    if (insertError) supabaseDatabaseError("save generic match", insertError.code);

    if (savings != null && (cand.confidence === "high" || cand.confidence === "medium")) {
      total += savings;
    }

    matches.push({
      id: row.id,
      medicationId: base.medicationId,
      brandName: base.brandName,
      jaProductCode: row.ja_product_code,
      jaProductName: row.ja_product_name,
      jaPackSize: typeof row.ja_pack_size === "number" ? row.ja_pack_size : row.ja_pack_size == null ? null : Number(row.ja_pack_size),
      jaMrpInr: row.ja_mrp_inr,
      jaUnitPriceInr: row.ja_unit_price_inr,
      brandUnitPriceInr: row.brand_unit_price_inr,
      monthlySavingsInr: row.monthly_savings_inr,
      confidence: row.confidence as "high" | "medium" | "low" | null,
      estimated: row.estimated ?? false,
    });
  }

  return { matches, totalMonthlySavingsInr: total };
}

async function storeSupabaseNoMatch(supabase: any, base: { medicationId: string; brandName: string }): Promise<GenericMatchResult> {
  const { data: row, error } = await supabase.from("generic_matches").insert({
    medication_id: base.medicationId,
    ja_product_name: null
  }).select().single();

  if (error) supabaseDatabaseError("save empty generic match", error.code);

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
