import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { computeInteractions, type MedSalt, type InteractionRunResult } from "@/lib/interactions";
import { uuid } from "@/lib/util/id";
import type { Finding, Severity, FindingSource, Salt } from "@/types/domain";

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
  "evidence",
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
    evidence: Array.isArray(row.evidence)
      ? row.evidence
      : typeof row.evidence === "string"
        ? safeParseJsonArray(row.evidence)
        : [],
    acknowledged: row.acknowledged === true,
  };
}

function safeParseJsonArray(json: string): Finding["evidence"] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
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

/**
 * Supabase-tenant entry point for POST /api/interactions/run. Shares the
 * exact curated/openFDA/dual-verify-LLM engine (`computeInteractions`) that
 * the Prisma tenant path uses (see `runInteractions` in `@/lib/interactions`)
 * — only how medicines are loaded and findings are persisted differs.
 */
export async function runSupabaseInteractions(): Promise<InteractionRunResult> {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data: medRows, error: medsError } = await supabase
    .from("medications")
    .select("id, brand_name, salts")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("status", "active");
  if (medsError) databaseError("load medicines", medsError.code);

  const rows = (medRows ?? []) as Record<string, any>[];
  const meds = rows.map((m) => ({ id: String(m.id), brandName: String(m.brand_name) }));

  const medSalts: MedSalt[] = [];
  for (const m of rows) {
    const salts = Array.isArray(m.salts) ? (m.salts as Salt[]) : [];
    for (const s of salts) {
      const inn = String((s as any)?.inn ?? "").trim();
      if (!inn) continue;
      medSalts.push({
        medId: String(m.id),
        brand: String(m.brand_name),
        inn: inn.toLowerCase(),
        fdaSearchName: String((s as any)?.fdaSearchName || inn),
      });
    }
  }

  const result = await computeInteractions(meds, medSalts, uuid);
  await persistSupabaseFindings(household.id, household.patient.id, result.findings);
  return result;
}

/**
 * Replace unacknowledged findings; keep acknowledged ones (mirrors the Prisma
 * path's `persistFindings`). `authenticated` has no INSERT/DELETE grant on
 * `interaction_findings` (only a column-scoped UPDATE for acknowledging), so
 * this must run on the service-role admin client. supabase-js has no
 * multi-statement transaction API, so instead of delete-then-insert (which
 * would leave the household with zero findings if the insert failed), this
 * inserts the new run's findings first and only then deletes the previous
 * run's stale unacknowledged rows — a failed cleanup step leaves old and new
 * findings visible together rather than silently losing data.
 */
async function persistSupabaseFindings(
  householdId: string,
  patientId: string,
  findings: Finding[],
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const runId = uuid();

  if (findings.length > 0) {
    const insertRows = findings.map((f) => ({
      id: f.id,
      household_id: householdId,
      patient_id: patientId,
      run_id: runId,
      pair_key: f.pairKey,
      med_a_id: f.medAId,
      med_b_id: f.medBId,
      salt_a: f.saltA,
      salt_b: f.saltB,
      severity: f.severity,
      source: f.source,
      explanation_en: f.explanationEn,
      explanation_hi: f.explanationHi,
      action_en: f.actionEn,
      action_hi: f.actionHi,
      evidence: f.evidence,
      acknowledged: false,
    }));
    const { error: insertError } = await admin.from("interaction_findings").insert(insertRows);
    if (insertError) databaseError("save interaction findings", insertError.code);
  }

  const { error: deleteError } = await admin
    .from("interaction_findings")
    .delete()
    .eq("household_id", householdId)
    .eq("patient_id", patientId)
    .eq("acknowledged", false)
    .neq("run_id", runId);
  if (deleteError) databaseError("clean up previous interaction findings", deleteError.code);
}
