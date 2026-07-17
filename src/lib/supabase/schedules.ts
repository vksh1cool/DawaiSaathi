import "server-only";

import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { callLLM } from "@/lib/openai";
import { SCHEDULE_SCHEMA, SCHEDULE_SYSTEM, scheduleZod } from "@/lib/prompts";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import type { ScheduleInput } from "@/lib/schedule";
import type { FoodRelation, FrequencyHint, ScheduleSuggestion, Salt } from "@/types/domain";

const SCHEDULE_COLUMNS = [
  "id",
  "medication_id",
  "times",
  "dose_instruction",
  "food_relation",
  "start_date",
  "end_date",
  "created_at",
  "medications!inner(id,brand_name,display_generic,status)",
].join(",");

const SUGGESTION_MEDICATION_COLUMNS = [
  "id",
  "display_generic",
  "salts",
  "usual_frequency_hint",
  "created_at",
].join(",");

const ANCHOR: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["08:00", "14:00", "20:00", "22:00"],
};

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseRow = Record<string, unknown>;

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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function jsonObject<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function dateOnly(value: unknown): string | null {
  return typeof value === "string" && value.length >= 10 ? value.slice(0, 10) : null;
}

function foodRelation(value: unknown): FoodRelation {
  return value === "before_food" || value === "after_food" || value === "with_food" || value === "any"
    ? value
    : "any";
}

function medicationRelation(value: unknown): SupabaseRow {
  if (Array.isArray(value)) return jsonObject<SupabaseRow>(value[0]) ?? {};
  return jsonObject<SupabaseRow>(value) ?? {};
}

function fallbackSuggestion(timesPerDay: number | null): { times: string[]; lowConfidence: boolean } {
  if (!timesPerDay) return { times: ["08:00"], lowConfidence: true };
  return { times: ANCHOR[Math.min(timesPerDay, 4)] ?? ["08:00"], lowConfidence: false };
}

export function serializeSupabaseSchedule(row: SupabaseRow) {
  const medication = medicationRelation(row.medications);
  return {
    id: String(row.id),
    medicationId: String(row.medication_id),
    medication: {
      id: String(medication.id ?? row.medication_id),
      brandName: String(medication.brand_name ?? ""),
      displayGeneric: String(medication.display_generic ?? ""),
    },
    times: stringArray(row.times),
    doseInstruction: row.dose_instruction == null ? null : String(row.dose_instruction),
    foodRelation: foodRelation(row.food_relation),
    startDate: dateOnly(row.start_date) ?? "",
    endDate: dateOnly(row.end_date),
  };
}

export async function getActiveSupabaseSchedules() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { data, error } = await supabase
    .from("schedules")
    .select(SCHEDULE_COLUMNS)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("active", true)
    .eq("medications.status", "active")
    .order("created_at", { ascending: true });
  if (error) databaseError("load reminder schedules", error.code);
  return (data ?? []).map((row) => serializeSupabaseSchedule(row as unknown as SupabaseRow));
}

export async function saveSupabaseSchedules(
  inputs: ScheduleInput[],
  weeklyOverridePatientName?: string,
) {
  const supabase = await createSupabaseServerClient();
  await requireTenant(supabase);
  const { error } = await supabase.rpc("save_medication_schedules", {
    schedules_input: inputs,
    weekly_override_patient_name: weeklyOverridePatientName ?? null,
  });
  if (error) databaseError("save reminder schedules", error.code);
}

export async function suggestSupabaseSchedules(): Promise<ScheduleSuggestion[]> {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { data, error } = await supabase
    .from("medications")
    .select(SUGGESTION_MEDICATION_COLUMNS)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) databaseError("load medicines for schedule suggestions", error.code);

  const medications = (data ?? []) as unknown as SupabaseRow[];
  if (medications.length === 0) return [];

  const input = medications.map((medication) => ({
    displayGeneric: String(medication.display_generic),
    salts: jsonArray<Salt>(medication.salts).map((salt) => salt.inn),
    usualFrequencyHint: jsonObject<FrequencyHint>(medication.usual_frequency_hint),
  }));

  try {
    const { suggestions } = await callLLM({
      system: SCHEDULE_SYSTEM,
      content: [{ type: "text", text: JSON.stringify(input) }],
      schemaName: "schedule_suggestion",
      jsonSchema: SCHEDULE_SCHEMA,
      zodSchema: scheduleZod,
    });
    return medications.map((medication, index) => ({
      medicationId: String(medication.id),
      times: suggestions[index]?.times ?? ["08:00"],
      foodRelation: (suggestions[index]?.foodRelation ?? "any") as FoodRelation,
      lowConfidence: suggestions[index]?.lowConfidence ?? true,
    }));
  } catch (err) {
    logger.warn({ err }, "supabase schedule suggestion LLM failed; using deterministic fallback");
    return medications.map((medication) => {
      const hint = jsonObject<FrequencyHint>(medication.usual_frequency_hint);
      const fallback = fallbackSuggestion(hint?.timesPerDay ?? null);
      return {
        medicationId: String(medication.id),
        times: fallback.times,
        foodRelation: "any",
        lowConfidence: fallback.lowConfidence,
      };
    });
  }
}
