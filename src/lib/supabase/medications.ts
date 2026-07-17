import "server-only";

import { AppError } from "@/lib/errors";
import {
  canonicalizeSalts,
  computeSpecialCheck,
  displayGenericForSalts,
  medicationSafety,
  type SerializedMedication,
} from "@/lib/medications";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication, MedForm, Salt } from "@/types/domain";
import type { patchMedicationSchema } from "@/lib/validation";
import type { z } from "zod";

const MEDICATION_COLUMNS = [
  "id",
  "brand_name",
  "display_generic",
  "salts",
  "form",
  "pack_size",
  "mrp_inr",
  "expiry_month",
  "batch_number",
  "manufacturer",
  "high_risk",
  "high_risk_reason",
  "field_confidence",
  "usual_frequency_hint",
  "status",
  "created_at",
].join(",");

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseMedicationRow = Record<string, unknown>;
type MedicationPatch = z.infer<typeof patchMedicationSchema>;

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

function jsonArray(value: unknown): Salt[] {
  return Array.isArray(value) ? (value as Salt[]) : [];
}

function jsonObject<T>(value: unknown): T | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : null;
}

function money(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthFromDate(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 7) return null;
  return value.slice(0, 7);
}

function expiryMonth(value: string | null | undefined): string | null {
  return value ? `${value}-01` : null;
}

export function serializeSupabaseMedication(row: SupabaseMedicationRow): SerializedMedication {
  const salts = jsonArray(row.salts);
  const expiryDate = monthFromDate(row.expiry_month);
  return {
    id: String(row.id),
    brandName: String(row.brand_name),
    displayGeneric: String(row.display_generic),
    salts,
    form: String(row.form) as MedForm,
    packSize: typeof row.pack_size === "number" ? row.pack_size : row.pack_size == null ? null : Number(row.pack_size),
    mrpInr: money(row.mrp_inr),
    expiryDate,
    expiryStatus: expiryStatus(expiryDate),
    batchNumber: row.batch_number == null ? null : String(row.batch_number),
    manufacturer: row.manufacturer == null ? null : String(row.manufacturer),
    highRisk: row.high_risk === true,
    highRiskReason: row.high_risk_reason == null ? null : String(row.high_risk_reason),
    specialCheck: computeSpecialCheck(salts),
    fieldConfidence: jsonObject(row.field_confidence),
    usualFrequencyHint: jsonObject(row.usual_frequency_hint),
    status: String(row.status),
  };
}

function draftToInsert(draft: DraftMedication, householdId: string, patientId: string, scanBatchId?: string) {
  const salts = canonicalizeSalts(draft.salts);
  const safety = medicationSafety(salts);
  return {
    household_id: householdId,
    patient_id: patientId,
    scan_batch_id: scanBatchId ?? null,
    brand_name: draft.brandName?.trim() || "Unknown medicine",
    display_generic: displayGenericForSalts(salts),
    salts,
    form: draft.form,
    pack_size: draft.packSize,
    mrp_inr: draft.mrpInr,
    expiry_month: expiryMonth(draft.expiryDate),
    batch_number: draft.batchNumber,
    manufacturer: draft.manufacturer,
    high_risk: safety.highRisk,
    high_risk_reason: safety.highRiskReason,
    field_confidence: draft.fieldConfidence,
    usual_frequency_hint: draft.usualFrequencyHint,
    status: "active",
  };
}

export async function listSupabaseMedications() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const { data, error } = await supabase
    .from("medications")
    .select(MEDICATION_COLUMNS)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) databaseError("load medicines", error.code);
  return (data ?? []).map((row) => serializeSupabaseMedication(row as unknown as SupabaseMedicationRow));
}

export async function createSupabaseMedications(drafts: DraftMedication[], scanBatchId?: string) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  if (scanBatchId) {
    const { data: claim, error: claimError } = await supabase
      .from("scan_batches")
      .update({ status: "confirming" })
      .eq("id", scanBatchId)
      .eq("household_id", household.id)
      .eq("patient_id", household.patient.id)
      .eq("status", "extracted")
      .select("id")
      .maybeSingle();
    if (claimError) databaseError("claim this scan", claimError.code);
    if (!claim) throw new AppError("VALIDATION", "This scan is no longer available to confirm.");
  }

  const rows = drafts.map((draft) => draftToInsert(draft, household.id, household.patient.id, scanBatchId));
  const { data, error } = await supabase
    .from("medications")
    .insert(rows)
    .select(MEDICATION_COLUMNS);
  if (error) databaseError("save medicines", error.code);

  if (scanBatchId) {
    const { error: confirmError } = await supabase
      .from("scan_batches")
      .update({ status: "confirmed" })
      .eq("id", scanBatchId)
      .eq("household_id", household.id)
      .eq("patient_id", household.patient.id)
      .eq("status", "confirming");
    if (confirmError) databaseError("confirm this scan", confirmError.code);
  }

  return (data ?? []).map((row) => serializeSupabaseMedication(row as unknown as SupabaseMedicationRow));
}

function patchToUpdate(body: MedicationPatch) {
  const update: Record<string, unknown> = {};
  const salts = body.salts ? canonicalizeSalts(body.salts) : undefined;
  const safety = salts ? medicationSafety(salts) : undefined;

  if (body.brandName !== undefined) update.brand_name = body.brandName;
  if (body.displayGeneric !== undefined || salts) {
    update.display_generic = salts ? displayGenericForSalts(salts) : body.displayGeneric;
  }
  if (salts) update.salts = salts;
  if (body.form !== undefined) update.form = body.form;
  if (body.packSize !== undefined) update.pack_size = body.packSize;
  if (body.mrpInr !== undefined) update.mrp_inr = body.mrpInr;
  if (body.expiryDate !== undefined) update.expiry_month = expiryMonth(body.expiryDate);
  if (body.batchNumber !== undefined) update.batch_number = body.batchNumber;
  if (body.manufacturer !== undefined) update.manufacturer = body.manufacturer;
  if (body.notes !== undefined) update.notes = body.notes;
  if (safety) {
    update.high_risk = safety.highRisk;
    update.high_risk_reason = safety.highRiskReason;
  }

  return update;
}

export async function updateSupabaseMedication(id: string, body: MedicationPatch) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const update = patchToUpdate(body);
  if (Object.keys(update).length === 0) {
    const { data, error } = await supabase
      .from("medications")
      .select(MEDICATION_COLUMNS)
      .eq("id", id)
      .eq("household_id", household.id)
      .eq("patient_id", household.patient.id)
      .maybeSingle();
    if (error) databaseError("load this medicine", error.code);
    if (!data) throw new AppError("NOT_FOUND", "Medicine not found.");
    return serializeSupabaseMedication(data as unknown as SupabaseMedicationRow);
  }

  const { data, error } = await supabase
    .from("medications")
    .update(update)
    .eq("id", id)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .select(MEDICATION_COLUMNS)
    .maybeSingle();
  if (error) databaseError("save this medicine", error.code);
  if (!data) throw new AppError("NOT_FOUND", "Medicine not found.");
  return serializeSupabaseMedication(data as unknown as SupabaseMedicationRow);
}

export async function archiveSupabaseMedication(id: string) {
  const supabase = await createSupabaseServerClient();
  await requireTenant(supabase);
  const { error } = await supabase.rpc("archive_medication", { medication_id_input: id });
  if (error) databaseError("archive this medicine", error.code);
}
