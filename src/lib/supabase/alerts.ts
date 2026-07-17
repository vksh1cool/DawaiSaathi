import "server-only";

import { AppError } from "@/lib/errors";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseAlertRow = Record<string, unknown>;

const databaseError = supabaseDatabaseError;

async function requireTenant(client: SupabaseClient): Promise<TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> }> {
  const userId = await getSupabaseUserId();
  if (!userId) throw new AppError("UNAUTHORIZED", "Caregiver sign-in is required.");
  const household = await getSupabaseHousehold(client);
  if (!household?.patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return household as TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> };
}

function iso(value: unknown): string {
  if (typeof value === "string") return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(0).toISOString();
}

export function serializeSupabaseAlert(row: SupabaseAlertRow) {
  return {
    id: String(row.id),
    type: String(row.type),
    messageEn: String(row.message_en),
    messageHi: String(row.message_hi),
    read: Boolean(row.read_at),
    createdAt: iso(row.created_at),
  };
}

export async function listSupabaseAlerts() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { data, error } = await supabase
    .from("caregiver_alerts")
    .select("id,type,message_en,message_hi,read_at,created_at")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) databaseError("load alerts", error.code);
  return (data ?? []).map((row) => serializeSupabaseAlert(row as unknown as SupabaseAlertRow));
}

export async function markSupabaseAlertRead(id: string) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { error } = await supabase
    .from("caregiver_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id);
  if (error) databaseError("mark this alert read", error.code);
}
