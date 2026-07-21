import "server-only";

import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";
import { supabaseDatabaseError } from "@/lib/supabase/errors";
import { getSupabaseSlotMedsForEvents } from "@/lib/supabase/reminder";
import { getAudioSet, ensureAudioOrFallback, type AudioSet, type AudioUrls } from "@/lib/calls";
import { placeCall } from "@/lib/integrations/twilio";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import { utcToLocalTime, slotKeyForTime } from "@/lib/util/dates";
import { twilioVoiceLocale, type CallLanguage } from "@/lib/languages";
import { uuid } from "@/lib/util/id";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const databaseError = supabaseDatabaseError;
const nextAttempt = () => new Date(Date.now() + config.retryDelayMinutes * 60 * 1000);

async function requireTenant(client: SupabaseClient): Promise<TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> }> {
  const userId = await getSupabaseUserId();
  if (!userId) throw new AppError("UNAUTHORIZED", "Caregiver sign-in is required.");
  const household = await getSupabaseHousehold(client);
  if (!household?.patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return household as TenantHousehold & { patient: NonNullable<TenantHousehold["patient"]> };
}

/** GET /api/calls (and the History screen server component) — call history. */
export async function listSupabaseReminderCalls() {
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);

  const { data, error } = await supabase
    .from("reminder_calls")
    .select("*")
    .eq("household_id", household.id)
    .eq("patient_id", household.patient.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) databaseError("load call history", error.code);

  const rows = (data ?? []) as Record<string, any>[];
  const tz = household.patient.timezone;

  const callIds = rows.map((c) => String(c.id));
  const doseCountByCall = new Map<string, number>();
  if (callIds.length > 0) {
    const { data: joinRows, error: joinError } = await supabase
      .from("reminder_call_dose_events")
      .select("call_id")
      .in("call_id", callIds);
    if (joinError) databaseError("load call history", joinError.code);
    for (const row of (joinRows ?? []) as Record<string, any>[]) {
      const id = String(row.call_id);
      doseCountByCall.set(id, (doseCountByCall.get(id) ?? 0) + 1);
    }
  }

  return rows.map((c) => {
    const callId = String(c.id);
    // getAudioSet() already validates legacy/malformed metadata and falls
    // back safely, so reusing it here keeps this mapping deterministic
    // without a second parser. `audio_object_key` is a compact JSON string
    // in exactly the shape `getAudioSet` expects (see the design note on
    // `getSupabaseReminderCallAdmin` in `@/lib/supabase/calls-admin.ts`).
    const medlist = getAudioSet({ id: callId, audioFile: String(c.audio_object_key ?? "") } as never).medlist;
    const medlistUrl = medlist ? `/api/audio/${medlist}` : null;
    const time = utcToLocalTime(new Date(c.scheduled_at_utc), tz);
    return {
      id: callId,
      time,
      slotKey: slotKeyForTime(time),
      mode: c.mode,
      attempt: c.attempt,
      twilioStatus: c.twilio_status,
      outcome: c.outcome,
      digitsPressed: c.digits_pressed,
      doseCount: doseCountByCall.get(callId) ?? 0,
      medlistUrl,
      createdAt: new Date(c.created_at).toISOString(),
    };
  });
}

/**
 * Supabase-tenant equivalent of `placeGroupReminder` in `@/lib/calls.ts`,
 * used by POST /api/calls/now. `authenticated` has no write grant on
 * `dose_events`/`reminder_calls`/`reminder_call_dose_events` (confirmed via
 * the migration's grants block), so every mutation below runs on the
 * service-role admin client; the RLS-scoped client is used only to resolve
 * and authenticate the caller's household/patient.
 */
export async function placeSupabaseGroupReminder(opts: {
  doseEventIds: string[];
  scheduledAtUtc: Date;
  mode: "twilio" | "simulated";
}): Promise<{ reminderCallId: string; audioSet: AudioSet; audioUrls: AudioUrls; placed: boolean }> {
  const { doseEventIds, scheduledAtUtc, mode } = opts;
  const supabase = await createSupabaseServerClient();
  const household = await requireTenant(supabase);
  const patient = household.patient;
  const admin = createSupabaseAdminClient();

  // Fast fail before building scripts/audio if nothing is actually pending. A
  // mixed group can occur when a caregiver already marked one medicine taken.
  const { data: candidateRows, error: candidateError } = await admin
    .from("dose_events")
    .select("id, attempts")
    .in("id", doseEventIds)
    .eq("household_id", household.id)
    .eq("patient_id", patient.id)
    .eq("status", "scheduled");
  if (candidateError) databaseError("check pending reminders", candidateError.code);
  const candidateEvents = (candidateRows ?? []) as { id: string; attempts: number }[];
  if (candidateEvents.length === 0) {
    throw new AppError("CONFLICT", "This reminder is already being handled.");
  }
  const pendingDoseEventIds = candidateEvents.map((event) => String(event.id));

  const tz = patient.timezone || config.defaultTz;
  const time = utcToLocalTime(scheduledAtUtc, tz);

  const slot = await getSupabaseSlotMedsForEvents(admin, household.id, patient.id, pendingDoseEventIds);
  const scripts = buildReminderScripts({
    patientName: patient.name,
    time,
    meds: slot.meds,
    foodRelation: slot.foodRelation,
    language: patient.language as CallLanguage,
    caregiverName: household.caregiverName,
  });

  const lang = patient.language as CallLanguage;
  const [medlist, menu, thanks, noinput] = await Promise.all([
    ensureAudioOrFallback(scripts.greetingMedlist, lang, patient.voiceGender, "medlist"),
    ensureAudioOrFallback(scripts.menu, lang, patient.voiceGender, "menu"),
    ensureAudioOrFallback(scripts.thanks, lang, patient.voiceGender, "thanks"),
    ensureAudioOrFallback(scripts.goodbyeNoinput, lang, patient.voiceGender, "noinput"),
  ]);

  // Twilio <Say> has no locale for every language this app supports in the
  // browser. For those languages a real phone call is safe only when every
  // clip was generated; the simulator remains available through device TTS.
  if (mode === "twilio" && !twilioVoiceLocale(lang) && [medlist, menu, thanks, noinput].some((clip) => !clip)) {
    throw new AppError(
      "TTS_UNAVAILABLE",
      "This reminder language needs generated call audio before a phone reminder can be placed. Try again after voice audio is available.",
    );
  }

  // Compact JSON (no bulky `fallback` text) — see the audio_object_key design
  // note on `getSupabaseReminderCallAdmin` in `./calls-admin.ts`. `getAudioSet`
  // already substitutes a generic spoken fallback when a clip is null, so the
  // exact same Twilio TwiML code that serves Prisma-tenant calls also serves
  // these calls unchanged.
  const audioObjectKey = JSON.stringify({ language: lang, medlist, menu, thanks, noinput });
  const attempt = Math.min(...candidateEvents.map((event) => Number(event.attempts))) + 1;
  const callId = uuid();

  // D1-style compare-and-set claim (Postgres via supabase-js has no
  // interactive multi-statement transaction API either): only a caller that
  // flips every pending event from scheduled to calling may create the
  // reminder_calls row. Mirrors `claimAndCreateCallOnD1` in `@/lib/calls.ts`.
  // On a count mismatch (lost the race) this intentionally does not try to
  // revert the events it did claim — `sweepSupabaseStuckCalls`'s orphan-claim
  // release recovers those after the lease window, the same trade-off already
  // accepted by the D1 path.
  const { data: claimedRows, error: claimError } = await admin
    .from("dose_events")
    .update({ status: "calling", next_attempt_at_utc: null })
    .in("id", pendingDoseEventIds)
    .eq("household_id", household.id)
    .eq("patient_id", patient.id)
    .eq("status", "scheduled")
    .select("id");
  if (claimError) databaseError("claim these reminders", claimError.code);
  if ((claimedRows?.length ?? 0) !== pendingDoseEventIds.length) {
    throw new AppError("CONFLICT", "This reminder is already being handled.");
  }

  let created = false;
  try {
    const { error: insertError } = await admin.from("reminder_calls").insert({
      id: callId,
      household_id: household.id,
      patient_id: patient.id,
      scheduled_at_utc: scheduledAtUtc.toISOString(),
      attempt,
      mode,
      audio_object_key: audioObjectKey,
    });
    if (insertError) throw insertError;
    created = true;

    const joinRows = pendingDoseEventIds.map((doseEventId) => ({
      call_id: callId,
      dose_event_id: doseEventId,
      household_id: household.id,
      patient_id: patient.id,
    }));
    const { error: joinError } = await admin.from("reminder_call_dose_events").insert(joinRows);
    if (joinError) throw joinError;
  } catch (error) {
    // A Worker interruption between the claim and full row creation must not
    // strand doses. Reset only our still-calling claim; a settled event never
    // gets reopened.
    await admin
      .from("dose_events")
      .update({ status: "scheduled", next_attempt_at_utc: nextAttempt().toISOString() })
      .in("id", pendingDoseEventIds)
      .eq("patient_id", patient.id)
      .eq("status", "calling");
    if (created) await admin.from("reminder_calls").delete().eq("id", callId);
    throw error;
  }

  let placed = mode === "simulated";
  if (mode === "twilio") {
    try {
      const sid = await placeCall(patient.phoneE164, callId);
      await admin.from("reminder_calls").update({ twilio_call_sid: sid }).eq("id", callId);
      placed = true;
      logger.info({ callId, attempt }, "reminder call placed (supabase)");
    } catch (err) {
      // Settle the failed attempt before reopening events for a retry.
      await admin.from("reminder_calls").update({ outcome: "failed" }).eq("id", callId);
      await admin
        .from("dose_events")
        .update({ status: "scheduled", next_attempt_at_utc: nextAttempt().toISOString() })
        .in("id", pendingDoseEventIds)
        .eq("patient_id", patient.id)
        .eq("status", "calling");
      logger.error({ err, callId }, "reminder call failed to place (supabase)");
    }
  }

  const audioSet: AudioSet = {
    language: lang,
    medlist,
    menu,
    thanks,
    noinput,
    fallback: {
      medlist: scripts.greetingMedlist,
      menu: scripts.menu,
      thanks: scripts.thanks,
      noinput: scripts.goodbyeNoinput,
    },
  };
  const url = (f: string | null) => (f ? `/api/audio/${f}` : null);
  return {
    reminderCallId: callId,
    audioSet,
    audioUrls: {
      medlistUrl: url(medlist),
      menuUrl: url(menu),
      thanksUrl: url(thanks),
      noinputUrl: url(noinput),
    },
    placed,
  };
}
