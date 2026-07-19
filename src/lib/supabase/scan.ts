import "server-only";

import { AppError } from "@/lib/errors";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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

export async function createSupabaseScanBatch() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("scan_batches")
    .insert({
      household_id: household.id,
      patient_id: household.patient.id,
      status: "processing",
    })
    .select("id, status")
    .single();

  if (error) databaseError("create scan batch", error.code);
  if (!data) throw new AppError("INTERNAL", "Failed to create scan batch");

  return {
    id: data.id,
    patientId: household.patient.id,
    status: data.status,
  };
}

export async function createSupabaseScanPhoto(batchId: string, filePath: string, mimeType: string, sizeBytes: number) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("scan_photos")
    .insert({
      household_id: household.id,
      patient_id: household.patient.id,
      batch_id: batchId,
      file_path: filePath,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    })
    .select("id")
    .single();

  if (error) databaseError("save scan photo", error.code);
  if (!data) throw new AppError("INTERNAL", "Failed to create scan photo");
  return data;
}

export async function updateSupabaseScanBatch(batchId: string, update: { status: "failed" | "extracted"; rawExtractionJson?: string }) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const payload: Record<string, unknown> = { status: update.status };
  if (update.rawExtractionJson !== undefined) {
    payload.raw_extraction = JSON.parse(update.rawExtractionJson);
  }

  const { error } = await supabase
    .from("scan_batches")
    .update(payload)
    .eq("id", batchId)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id);

  if (error) databaseError("update scan batch", error.code);
}

export async function getSupabaseScanPhoto(batchId: string, filePaths: string[]) {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("scan_photos")
    .select("mime_type, file_path")
    .eq("batch_id", batchId)
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .in("file_path", filePaths)
    .limit(1)
    .maybeSingle();

  if (error) databaseError("load scan photo", error.code);
  return data ? { mimeType: data.mime_type, filePath: data.file_path } : null;
}
