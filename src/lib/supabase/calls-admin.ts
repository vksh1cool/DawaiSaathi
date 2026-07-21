import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";
import { utcToLocalTime, slotLabel } from "@/lib/util/dates";
import { uuid } from "@/lib/util/id";
import { logger } from "@/lib/logger";

/** Service-role (admin-client) helpers backing the Twilio webhooks for Supabase tenants. */

const nextAttempt = () => new Date(Date.now() + config.retryDelayMinutes * 60 * 1000);

export type SupabaseReminderCallAdmin = {
  id: string;
  householdId: string;
  patientId: string;
  scheduledAtUtc: Date;
  attempt: number;
  mode: "twilio" | "simulated";
  twilioCallSid: string | null;
  twilioStatus: string | null;
  digitsPressed: string | null;
  outcome: "confirmed" | "no_input" | "not_answered" | "failed" | null;
  replayCount: number;
  /**
   * Compact JSON `{language, medlist, menu, thanks, noinput}` — the four
   * content-addressed clip filenames from `ensureAudio()`, no `fallback` text
   * (kept out to stay well under the 512-char `audio_object_key` column
   * check). `getAudioSet()` in `@/lib/calls.ts` already substitutes its own
   * generic spoken fallback whenever `stored.fallback` is absent, so passing
   * this string straight through as `audioFile` makes `getAudioSet()` work
   * completely unchanged for Supabase-shaped calls — the only difference from
   * a Prisma-tenant call is that a clip that failed to generate at
   * call-placement time speaks a generic phrase instead of the exact
   * medicine-specific fallback text (an accepted, narrow degradation).
   */
  audioFile: string;
  doseEventIds: string[];
};

export async function getSupabaseReminderCallAdmin(id: string): Promise<SupabaseReminderCallAdmin | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("reminder_calls").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: joinRows, error: joinError } = await admin
    .from("reminder_call_dose_events")
    .select("dose_event_id")
    .eq("call_id", id);
  if (joinError) throw joinError;

  return {
    id: String(data.id),
    householdId: String(data.household_id),
    patientId: String(data.patient_id),
    scheduledAtUtc: new Date(data.scheduled_at_utc),
    attempt: Number(data.attempt),
    mode: data.mode === "simulated" ? "simulated" : "twilio",
    twilioCallSid: (data.twilio_call_sid as string | null) ?? null,
    twilioStatus: (data.twilio_status as string | null) ?? null,
    digitsPressed: (data.digits_pressed as string | null) ?? null,
    outcome: (data.outcome as SupabaseReminderCallAdmin["outcome"]) ?? null,
    replayCount: Number(data.replay_count ?? 0),
    audioFile: String(data.audio_object_key ?? ""),
    doseEventIds: ((joinRows ?? []) as { dose_event_id: unknown }[]).map((row) => String(row.dose_event_id)),
  };
}

export type SupabaseGatherAction = "confirmed" | "repeat" | "noinput";

/** Handle a DTMF keypress — same code path as `handleGatherResult` in `@/lib/calls.ts` (AC-10.1). */
export async function handleSupabaseGatherResult(
  callId: string,
  digits: string,
): Promise<{ action: SupabaseGatherAction; call: SupabaseReminderCallAdmin } | null> {
  const admin = createSupabaseAdminClient();
  const call = await getSupabaseReminderCallAdmin(callId);
  if (!call) return null;

  // Gather/status webhooks are delivered at least once. A duplicate keypress
  // must report the settled result without mutating dose events again.
  if (call.outcome === "confirmed") return { action: "confirmed", call };
  if (call.outcome) return { action: "noinput", call };

  const doseEventIds = call.doseEventIds;

  if (digits === "1") {
    const { data: events, error: eventsError } = await admin
      .from("dose_events")
      .select("id, status")
      .in("id", doseEventIds);
    if (eventsError) throw eventsError;
    const eligible =
      (events ?? []).length === doseEventIds.length &&
      (events ?? []).every((event: { status: string }) => event.status === "calling" || event.status === "confirmed");
    if (!eligible) return { action: "noinput", call };

    const { data: claimedRows, error: claimError } = await admin
      .from("reminder_calls")
      .update({ outcome: "confirmed", digits_pressed: "1" })
      .eq("id", callId)
      .is("outcome", null)
      .select("id");
    if (claimError) throw claimError;

    if (!claimedRows || claimedRows.length === 0) {
      const settled = await getSupabaseReminderCallAdmin(callId);
      return { action: settled?.outcome === "confirmed" ? "confirmed" : "noinput", call: settled ?? call };
    }

    const via = call.mode === "simulated" ? "simulated" : "ivr_dtmf";
    const { error: doseError } = await admin
      .from("dose_events")
      .update({ status: "confirmed", confirmed_via: via, confirmed_at_utc: new Date().toISOString() })
      .in("id", doseEventIds)
      .eq("status", "calling");
    if (doseError) throw doseError;

    const settled = await getSupabaseReminderCallAdmin(callId);
    return { action: "confirmed", call: settled ?? call };
  }

  if (digits === "2" && call.replayCount < 1) {
    const { data: claimedRows, error: claimError } = await admin
      .from("reminder_calls")
      .update({ replay_count: call.replayCount + 1, digits_pressed: "2" })
      .eq("id", callId)
      .is("outcome", null)
      .lt("replay_count", 1)
      .select("id");
    if (!claimError && claimedRows && claimedRows.length > 0) {
      const updated = await getSupabaseReminderCallAdmin(callId);
      if (updated) return { action: "repeat", call: updated };
    }
  }

  return { action: "noinput", call };
}

/**
 * Retry-or-missed after a call concludes unconfirmed — Supabase-tenant
 * equivalent of `finalizeUnconfirmed` in `@/lib/calls.ts` (Arch §12.3).
 * Idempotent: no-op if already confirmed/settled.
 */
export async function finalizeSupabaseUnconfirmed(
  callId: string,
  outcome: "no_input" | "not_answered" | "failed" = "no_input",
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const call = await getSupabaseReminderCallAdmin(callId);
  if (!call || call.outcome !== null) return;

  // Claim finalization before touching attempts. Status callbacks and the
  // stuck-call sweep can race; only one may consume a retry.
  const { data: claimedRows, error: claimError } = await admin
    .from("reminder_calls")
    .update({ outcome })
    .eq("id", callId)
    .is("outcome", null)
    .select("id");
  if (claimError || !claimedRows || claimedRows.length === 0) return; // race lost

  const doseEventIds = call.doseEventIds;
  const { data: events, error: eventsError } = await admin.from("dose_events").select("*").in("id", doseEventIds);
  if (eventsError || !events) return;

  const missed: string[] = [];
  for (const event of events as Record<string, any>[]) {
    if (event.status !== "calling") continue;
    const attempts = Number(event.attempts) + 1;
    if (attempts < config.maxCallAttempts) {
      await admin
        .from("dose_events")
        .update({ status: "scheduled", attempts, next_attempt_at_utc: nextAttempt().toISOString() })
        .eq("id", event.id);
    } else {
      await admin.from("dose_events").update({ status: "missed", attempts, next_attempt_at_utc: null }).eq("id", event.id);
      missed.push(String(event.id));
    }
  }

  if (missed.length === 0) return;

  const { data: patient, error: patientError } = await admin
    .from("patients")
    .select("id, household_id, name, timezone, phone_e164, language, sms_reminder_consent_at")
    .eq("id", call.patientId)
    .maybeSingle();
  if (patientError || !patient) return;

  const tz = (patient.timezone as string) || config.defaultTz;
  const time = utcToLocalTime(call.scheduledAtUtc, tz);
  const enLbl = slotLabel(time, "en");
  const hiLbl = slotLabel(time, "hi");
  const n = config.maxCallAttempts;

  const alertId = uuid();
  const { error: alertError } = await admin.from("caregiver_alerts").insert({
    id: alertId,
    household_id: patient.household_id,
    patient_id: patient.id,
    // Supabase's check constraint names this outcome 'unconfirmed_dose'
    // (the legacy Prisma enum calls the same thing 'missed_dose').
    type: "unconfirmed_dose",
    message_en: `${patient.name} did not confirm the ${enLbl} medicines (${n} calls tried).`,
    message_hi: `${patient.name} जी ने ${hiLbl} की दवाई की पुष्टि नहीं की (${n} बार फ़ोन किया गया)।`,
  });
  if (!alertError) {
    const joinRows = missed.map((doseEventId) => ({
      alert_id: alertId,
      dose_event_id: doseEventId,
      household_id: patient.household_id,
      patient_id: patient.id,
    }));
    const { error: alertJoinError } = await admin.from("caregiver_alert_dose_events").insert(joinRows);
    if (alertJoinError) logger.error({ err: alertJoinError, alertId }, "failed to link missed dose events to alert");
  } else {
    logger.error({ err: alertError, patientId: patient.id }, "failed to create missed-dose caregiver alert");
  }

  // NOTE: the legacy Prisma path also queues a low-information SMS fallback
  // here (`queueSmsReminderFallback` / `deliverQueuedSmsReminder`) backed by
  // an `SmsDelivery` table. The Supabase-tenant equivalent, `private.sms_deliveries`,
  // is intentionally NOT exposed through PostgREST's Data API ("Worker-only
  // tables are not exposed through the Data API" — see the migration comment
  // above `private.ai_request_budgets`), so it cannot be reached through
  // supabase-js `.from(...)` at all, by any client (admin included). Sending
  // this SMS fallback for Supabase tenants needs either a new SECURITY
  // DEFINER RPC or a direct Postgres connection — a schema change, and out of
  // scope for this pass. The in-app caregiver alert above still fires; only
  // the redundant SMS follow-up is skipped for Supabase tenants. This is a
  // known, intentional, documented gap.
}

/** Sweep calls stuck in "calling" >5 min (lost webhooks) — Arch §12.3. */
export async function sweepSupabaseStuckCalls(): Promise<void> {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuck, error: stuckError } = await admin
    .from("reminder_calls")
    .select("id")
    .is("outcome", null)
    .lt("updated_at", cutoff);
  if (!stuckError) {
    for (const call of (stuck ?? []) as { id: string }[]) {
      logger.warn({ callId: call.id }, "sweeping stuck call (supabase)");
      await finalizeSupabaseUnconfirmed(String(call.id), "not_answered");
    }
  }

  await releaseOrphanedSupabaseCallClaims(cutoff);
}

/**
 * A Worker could stop after the compare-and-set claim in
 * `placeSupabaseGroupReminder` but before the `reminder_calls` row (and its
 * join rows) finished writing. Return only lease-expired events that do not
 * belong to an open call; active ringing calls are left to the sweep above —
 * mirrors `releaseOrphanedCallClaims` in `@/lib/calls.ts`.
 */
async function releaseOrphanedSupabaseCallClaims(cutoffIso: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const [{ data: openCalls }, { data: staleEvents }] = await Promise.all([
    admin.from("reminder_calls").select("id").is("outcome", null),
    admin.from("dose_events").select("id").eq("status", "calling").lt("updated_at", cutoffIso),
  ]);

  const openCallIds = ((openCalls ?? []) as { id: string }[]).map((call) => String(call.id));
  let claimedEventIds = new Set<string>();
  if (openCallIds.length > 0) {
    const { data: joinRows } = await admin
      .from("reminder_call_dose_events")
      .select("dose_event_id")
      .in("call_id", openCallIds);
    claimedEventIds = new Set(((joinRows ?? []) as { dose_event_id: string }[]).map((row) => String(row.dose_event_id)));
  }

  const orphanedIds = ((staleEvents ?? []) as { id: string }[])
    .map((event) => String(event.id))
    .filter((id) => !claimedEventIds.has(id));
  if (orphanedIds.length === 0) return;

  const { data: released, error: releaseError } = await admin
    .from("dose_events")
    .update({ status: "scheduled", next_attempt_at_utc: nextAttempt().toISOString() })
    .in("id", orphanedIds)
    .eq("status", "calling")
    .lt("updated_at", cutoffIso)
    .select("id");
  if (!releaseError && released && released.length > 0) {
    logger.warn({ released: released.length }, "released orphaned reminder call claims (supabase)");
  }
}
