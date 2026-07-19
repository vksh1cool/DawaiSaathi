import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { parseEvidence } from "@/lib/db";
import type { Finding, Severity, FindingSource } from "@/types/domain";

const FINDING_COLUMNS = [
  "id",
  "pair_key",
  "med_a_id",
  "med_b_id",
  "salt_a",
  "salt_b",
  "severity",
  "source",
  "explanation_en",
  "explanation_hi",
  "action_en",
  "action_hi",
  "evidence_json",
  "acknowledged",
  "created_at",
].join(",");

const databaseError = supabaseDatabaseError;

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function requireTenant(client: SupabaseClient): Promise<TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> }> {
  const household = await getSupabaseHousehold(client);
  if (!household?.patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return household as TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> };
}

export function serializeSupabaseFinding(row: Record<string, any>, brandMap: Map<string, string>): Finding {
  return {
    id: String(row.id),
    pairKey: String(row.pair_key),
    medAId: String(row.med_a_id),
    medBId: String(row.med_b_id),
    saltA: String(row.salt_a),
    saltB: String(row.salt_b),
    brandA: brandMap.get(String(row.med_a_id)) ?? String(row.salt_a),
    brandB: brandMap.get(String(row.med_b_id)) ?? String(row.salt_b),
    severity: String(row.severity) as Severity,
    source: String(row.source) as FindingSource,
    explanationEn: String(row.explanation_en),
    explanationHi: String(row.explanation_hi),
    actionEn: String(row.action_en),
    actionHi: String(row.action_hi),
    evidence: parseEvidence(typeof row.evidence_json === "string" ? row.evidence_json : JSON.stringify(row.evidence_json)),
    acknowledged: row.acknowledged === true,
  };
}

export async function listSupabaseInteractionFindings() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data: meds, error: medsError } = await supabase
    .from("medications")
    .select("id, brand_name")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id);

  if (medsError) databaseError("load medicines", medsError.code);
  const brandMap = new Map((meds ?? []).map((m: any) => [String(m.id), String(m.brand_name)]));

  const { data, error } = await supabase
    .from("interaction_findings")
    .select(FINDING_COLUMNS)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .order("acknowledged", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) databaseError("load interactions", error.code);

  const rows = (data ?? []) as Record<string, any>[];
  const findings = rows.map((row) => serializeSupabaseFinding(row, brandMap));
  return { findings, lastRunAt: rows[0]?.created_at ?? null };
}

export async function acknowledgeSupabaseInteractionFinding(id: string) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("interaction_findings")
    .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .select(FINDING_COLUMNS)
    .maybeSingle();

  if (error) databaseError("acknowledge interaction", error.code);
  if (!data) throw new AppError("NOT_FOUND", "Finding not found.");

  const { data: meds, error: medsError } = await supabase
    .from("medications")
    .select("id, brand_name")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id);
  if (medsError) databaseError("load medicines", medsError.code);
  const brandMap = new Map((meds ?? []).map((m: any) => [String(m.id), String(m.brand_name)]));

  return serializeSupabaseFinding(data, brandMap);
}
