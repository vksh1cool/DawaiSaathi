import "server-only";

import { AppError } from "@/lib/errors";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { relation } from "@/lib/supabase/dose-events";
import { buildReminderScripts, type ScriptMed, type ReminderScripts } from "@/lib/ivr/scripts";
import type { SlotMeds } from "@/lib/reminder";
import type { FoodRelation } from "@/types/domain";
import type { CallLanguage } from "@/lib/languages";

/** Supabase-tenant equivalent of `@/lib/reminder.ts` (Arch §10, §12.3). */

const databaseError = supabaseDatabaseError;

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function requireTenant(
  client: SupabaseClient,
): Promise<TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> }> {
  const userId = await getSupabaseUserId();
  if (!userId) throw new AppError("UNAUTHORIZED", "Caregiver sign-in is required.");
  const household = await getSupabaseHousehold(client);
  if (!household?.patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return household as TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> };
}

function asFoodRelation(value: unknown): FoodRelation | null {
  return value === "before_food" || value === "after_food" || value === "with_food" || value === "any"
    ? value
    : null;
}

/** Medicines scheduled at a given local time (from active schedules) — used by /api/tts/preview. */
export async function getSupabaseSlotMeds(time: string): Promise<SlotMeds> {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("schedules")
    .select("times, dose_instruction, food_relation, medications!inner(brand_name, status)")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("active", true)
    .eq("medications.status", "active");
  if (error) databaseError("load reminder medicines", error.code);

  const meds: ScriptMed[] = [];
  const foods = new Set<FoodRelation>();
  for (const row of (data ?? []) as Record<string, any>[]) {
    const times = Array.isArray(row.times) ? row.times : [];
    if (!times.includes(time)) continue;
    const medication = relation(row.medications);
    const doseInstruction = typeof row.dose_instruction === "string" ? row.dose_instruction.trim() : "";
    if (doseInstruction) {
      meds.push({ brandName: String(medication.brand_name ?? ""), doseInstruction });
    }
    const foodRelation = asFoodRelation(row.food_relation);
    if (foodRelation) foods.add(foodRelation);
  }
  const foodRelation: FoodRelation = foods.size === 1 ? [...foods][0]! : "any";
  return { meds, foodRelation };
}

/**
 * Medicines for a set of dose events (used at call time). Accepts the caller's
 * client so it can run either RLS-scoped (previews) or through the service-role
 * admin client (call placement, which claims events on the admin client — see
 * `placeSupabaseGroupReminder` in `@/lib/supabase/calls.ts`).
 */
export async function getSupabaseSlotMedsForEvents(
  client: Pick<SupabaseClient, "from">,
  householdId: string,
  patientId: string,
  doseEventIds: string[],
): Promise<SlotMeds> {
  const { data, error } = await client
    .from("dose_events")
    .select("id, medications!inner(brand_name), schedules(dose_instruction, food_relation)")
    .in("id", doseEventIds)
    .eq("household_id", householdId)
    .eq("patient_id", patientId);
  if (error) databaseError("load reminder medicines", (error as { code?: string }).code);

  const rows = (data ?? []) as Record<string, any>[];
  const meds: ScriptMed[] = [];
  const foods = new Set<FoodRelation>();
  for (const row of rows) {
    const medication = relation(row.medications);
    const schedule = relation(row.schedules);
    const doseInstruction = typeof schedule.dose_instruction === "string" ? schedule.dose_instruction.trim() : "";
    if (doseInstruction) {
      meds.push({ brandName: String(medication.brand_name ?? ""), doseInstruction });
    }
    const foodRelation = asFoodRelation(schedule.food_relation);
    if (foodRelation) foods.add(foodRelation);
  }
  const foodRelation: FoodRelation = foods.size === 1 ? [...foods][0]! : "any";
  if (meds.length !== rows.length) {
    // Defensive guard for event records created before the exact regimen
    // migration (mirrors `getSlotMedsForEvents` in `@/lib/reminder.ts`). Call
    // placement refuses rather than inventing a dose.
    throw new AppError("VALIDATION", "This reminder needs its exact dose instruction before a call can be placed.");
  }
  return { meds, foodRelation };
}

type PreviewOverride = { medicationId: string; doseInstruction: string; foodRelation: FoodRelation };

async function resolveOverrideSlot(
  client: SupabaseClient,
  household: TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> },
  overrides: PreviewOverride[],
): Promise<SlotMeds> {
  const medicationIds = overrides.map((override) => override.medicationId);
  const { data, error } = await client
    .from("medications")
    .select("id, brand_name")
    .in("id", medicationIds)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("status", "active");
  if (error) databaseError("load these medicines", error.code);
  const rows = (data ?? []) as { id: string; brand_name: string }[];
  if (rows.length !== overrides.length) {
    throw new AppError("VALIDATION", "One or more medicines are not available for this preview.");
  }
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  const foods = new Set<FoodRelation>(overrides.map((override) => override.foodRelation));
  return {
    meds: overrides.map((override) => ({
      brandName: String(byId.get(override.medicationId)!.brand_name),
      doseInstruction: override.doseInstruction,
    })),
    foodRelation: foods.size === 1 ? [...foods][0]! : "any",
  };
}

/**
 * Preview scripts for the Schedule screen's "hear it" button (POST
 * /api/tts/preview) — the Supabase-tenant equivalent of `buildSlotScripts` +
 * `getSlotMeds` in `@/lib/reminder.ts`. `overrides`, when present, previews an
 * unsaved schedule draft instead of the persisted regimen (mirrors the
 * route's `schedules` body field).
 */
export async function buildSupabaseSlotScripts(
  time: string,
  overrides?: PreviewOverride[],
): Promise<{ scripts: ReminderScripts; language: CallLanguage; voiceGender: string }> {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const patient = household.patient;

  const slot = overrides ? await resolveOverrideSlot(supabase, household, overrides) : await getSupabaseSlotMeds(time);
  if (slot.meds.length === 0) {
    throw new AppError("VALIDATION", "No medicines are scheduled at this time yet.");
  }

  const scripts = buildReminderScripts({
    patientName: patient.name,
    time,
    meds: slot.meds,
    foodRelation: slot.foodRelation,
    language: patient.language as CallLanguage,
    caregiverName: household.caregiverName,
  });

  return { scripts, language: patient.language as CallLanguage, voiceGender: patient.voiceGender };
}
