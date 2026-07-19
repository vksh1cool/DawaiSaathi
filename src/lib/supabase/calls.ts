import "server-only";

import { AppError } from "@/lib/errors";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { getAudioSet } from "@/lib/calls";
import { utcToLocalTime, slotKeyForTime } from "@/lib/util/dates";

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

export async function listSupabaseReminderCalls() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  
  const { data, error } = await supabase
    .from("reminder_calls")
    .select("*")
    .eq("patient_id", household.patient.id)
    .order("created_at", { ascending: false })
    .limit(50);
    
  if (error) databaseError("load call history", error.code);

  const tz = household.patient.timezone;

  return (data ?? []).map((c: any) => {
    // Map to Prisma model shape for getAudioSet
    const mappedCall = {
      ...c,
      audioFile: c.audio_file,
    };
    
    const medlist = getAudioSet(mappedCall as any).medlist;
    const medlistUrl = medlist ? `/api/audio/${medlist}` : null;
    
    let doseCount = 0;
    try {
      const parsed = JSON.parse(c.dose_event_ids_json);
      if (Array.isArray(parsed)) doseCount = parsed.length;
    } catch {
      // Ignore invalid JSON
    }

    return {
      id: c.id,
      time: utcToLocalTime(new Date(c.scheduled_at_utc), tz),
      slotKey: slotKeyForTime(utcToLocalTime(new Date(c.scheduled_at_utc), tz)),
      mode: c.mode,
      attempt: c.attempt,
      twilioStatus: c.twilio_status,
      outcome: c.outcome,
      digitsPressed: c.digits_pressed,
      doseCount,
      medlistUrl,
      createdAt: new Date(c.created_at).toISOString(),
    };
  });
}
