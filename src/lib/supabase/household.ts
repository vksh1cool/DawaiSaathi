import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TenantPatient = {
  id: string;
  name: string;
  phoneE164: string;
  language: string;
  voiceGender: "female" | "male";
  timezone: string;
  smsReminderConsent: boolean;
};

export type TenantHousehold = {
  id: string;
  caregiverName: string;
  uiLanguage: string;
  patient: TenantPatient | null;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function databaseError(operation: string, code?: string): never {
  // Database messages can contain implementation detail. The Worker logs only
  // the stable operation/code; the browser gets a recoverable generic error.
  throw new AppError(
    code === "PGRST116" ? "NOT_FOUND" : "INTERNAL",
    "We could not " + operation + ". Please try again.",
  );
}

function mapPatient(row: Record<string, unknown>): TenantPatient {
  return {
    id: String(row.id),
    name: String(row.name),
    phoneE164: String(row.phone_e164),
    language: String(row.language),
    voiceGender: row.voice_gender === "male" ? "male" : "female",
    timezone: String(row.timezone),
    smsReminderConsent: Boolean(row.sms_reminder_consent_at),
  };
}

export async function getSupabaseHousehold(
  client?: SupabaseServerClient,
): Promise<TenantHousehold | null> {
  const supabase = client ?? (await createSupabaseServerClient());
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("active_household_id")
    .maybeSingle();
  if (profileError) databaseError("load your secure account", profileError.code);
  const activeHouseholdId = profile?.active_household_id;
  if (!activeHouseholdId || typeof activeHouseholdId !== "string") return null;

  const { data: household, error: householdError } = await supabase
    .from("households")
    .select("id, caregiver_name, ui_language")
    .eq("id", activeHouseholdId)
    .maybeSingle();
  if (householdError) databaseError("load your household", householdError.code);
  if (!household) return null;

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, name, phone_e164, language, voice_gender, timezone, sms_reminder_consent_at")
    .eq("household_id", activeHouseholdId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (patientError) databaseError("load the patient", patientError.code);

  return {
    id: String(household.id),
    caregiverName: String(household.caregiver_name),
    uiLanguage: String(household.ui_language),
    patient: patient ? mapPatient(patient as Record<string, unknown>) : null,
  };
}
