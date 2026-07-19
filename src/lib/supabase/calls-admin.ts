import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";
import { config } from "@/lib/config";
import { placeCall, sendReminderSms } from "@/lib/integrations/twilio";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import { utcToLocalTime, slotLabel } from "@/lib/util/dates";
import { isCallLanguage, twilioVoiceLocale, type CallLanguage } from "@/lib/languages";
import { ensureAudio } from "@/lib/tts";
import { logger } from "@/lib/logger";

const nextAttempt = () => new Date(Date.now() + config.retryDelayMinutes * 60 * 1000);

export async function getSupabaseReminderCallAdmin(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("reminder_calls").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...data,
    id: data.id,
    scheduledAtUtc: new Date(data.scheduled_at_utc),
    doseEventIdsJson: data.dose_event_ids_json,
    twilioCallSid: data.twilio_call_sid,
    twilioStatus: data.twilio_status,
    digitsPressed: data.digits_pressed,
    replayCount: data.replay_count,
    audioFile: data.audio_file,
    patientId: data.patient_id,
    outcome: data.outcome,
    mode: data.mode,
    attempt: data.attempt,
  };
}

export async function handleSupabaseGatherResult(callId: string, digits: string) {
  const admin = createSupabaseAdminClient();
  const call = await getSupabaseReminderCallAdmin(callId);
  if (!call) return null;

  if (call.outcome === "confirmed") return { action: "confirmed" as const, call };
  if (call.outcome) return { action: "noinput" as const, call };

  let doseEventIds: string[] = [];
  try {
    doseEventIds = JSON.parse(call.doseEventIdsJson);
  } catch {
    return { action: "noinput" as const, call };
  }

  if (digits === "1") {
    const { data: events } = await admin.from("dose_events").select("id, status").in("id", doseEventIds);
    if (!events) return { action: "noinput" as const, call };
    const eligible = events.length === doseEventIds.length && events.every(e => e.status === "calling" || e.status === "confirmed");
    if (!eligible) return { action: "noinput" as const, call };

    // Update call
    const { error: callUpdateErr } = await admin.from("reminder_calls").update({ outcome: "confirmed", digits_pressed: "1" }).eq("id", callId).is("outcome", null);
    
    // Refresh to check if we won the update race
    const settled = await getSupabaseReminderCallAdmin(callId);
    if (callUpdateErr || !settled || settled.outcome !== "confirmed") {
      return { action: settled?.outcome === "confirmed" ? "confirmed" as const : "noinput" as const, call: settled || call };
    }

    const via = call.mode === "simulated" ? "simulated" : "ivr_dtmf";
    await admin.from("dose_events").update({ status: "confirmed", confirmed_via: via, confirmed_at_utc: new Date().toISOString() }).in("id", doseEventIds).eq("status", "calling");
    
    return { action: "confirmed" as const, call: settled };
  }

  if (digits === "2" && call.replayCount < 1) {
    const { error: callUpdateErr } = await admin.from("reminder_calls").update({ replay_count: call.replayCount + 1, digits_pressed: "2" }).eq("id", callId).is("outcome", null);
    if (!callUpdateErr) {
      const updated = await getSupabaseReminderCallAdmin(callId);
      if (updated) return { action: "repeat" as const, call: updated };
    }
  }

  return { action: "noinput" as const, call };
}

export async function finalizeSupabaseUnconfirmed(callId: string, outcome: "no_input" | "not_answered" | "failed" = "no_input") {
  const admin = createSupabaseAdminClient();
  const call = await getSupabaseReminderCallAdmin(callId);
  if (!call || call.outcome !== null) return;

  const { error: claimErr } = await admin.from("reminder_calls").update({ outcome }).eq("id", callId).is("outcome", null);
  if (claimErr) return; // race lost

  let doseEventIds: string[] = [];
  try { doseEventIds = JSON.parse(call.doseEventIdsJson); } catch { return; }

  const { data: events } = await admin.from("dose_events").select("*").in("id", doseEventIds);
  if (!events) return;

  const missed: string[] = [];
  for (const event of events) {
    if (event.status !== "calling") continue;
    const attempts = event.attempts + 1;
    if (attempts < config.maxCallAttempts) {
      await admin.from("dose_events").update({ status: "scheduled", attempts, next_attempt_at_utc: nextAttempt().toISOString() }).eq("id", event.id);
    } else {
      await admin.from("dose_events").update({ status: "missed", attempts, next_attempt_at_utc: null }).eq("id", event.id);
      missed.push(event.id);
    }
  }

  if (missed.length > 0) {
    const { data: patient } = await admin.from("patients").select("id, name, timezone, phone_e164, language, sms_reminder_consent_at").eq("id", call.patientId).single();
    if (!patient) return;
    
    const tz = patient.timezone || config.defaultTz;
    const time = utcToLocalTime(call.scheduledAtUtc, tz);
    const enLbl = slotLabel(time, "en");
    const hiLbl = slotLabel(time, "hi");
    const n = config.maxCallAttempts;

    await admin.from("caregiver_alerts").insert({
      patient_id: patient.id,
      type: "missed_dose",
      dose_event_ids_json: JSON.stringify(missed),
      message_en: `${patient.name} did not confirm the ${enLbl} medicines (${n} calls tried).`,
      message_hi: `${patient.name} जी ने ${hiLbl} की दवाई की पुष्टि नहीं की (${n} बार फ़ोन किया गया)।`,
    });

    if (config.smsEnabled && patient.sms_reminder_consent_at) {
      // Queue SMS
      const { data: delivery } = await admin.from("sms_deliveries").insert({
        patient_id: patient.id,
        reminder_call_id: call.id,
        to_e164: patient.phone_e164,
        body_version: "2026-07-17",
      }).select("id").maybeSingle();

      if (delivery) {
        // We do not await this, or we can await a separate method
        // Actually, let's just trigger deliverSupabaseQueuedSmsReminder immediately
        await deliverSupabaseQueuedSmsReminder(delivery.id);
      }
    }
  }
}

export async function deliverSupabaseQueuedSmsReminder(deliveryId: string) {
  const admin = createSupabaseAdminClient();
  const { error: claimErr } = await admin.from("sms_deliveries").update({ status: "sending", error_code: null }).eq("id", deliveryId).eq("status", "queued");
  if (claimErr) return;

  const { data: delivery } = await admin.from("sms_deliveries").select("*, patients(language, sms_reminder_consent_at)").eq("id", deliveryId).single();
  if (!delivery || !delivery.patients?.sms_reminder_consent_at) {
    await admin.from("sms_deliveries").update({ status: "failed", error_code: "consent_revoked" }).eq("id", deliveryId).eq("status", "sending");
    return;
  }

  const lang = delivery.patients.language as CallLanguage;
  let body = null;
  if (lang === "hi") {
    body = "DawaiSaathi: कृपया अपनी दवाई की योजना जाँचें। मदद चाहिए तो देखभाल करने वाले, डॉक्टर या फार्मासिस्ट से बात करें। SMS बंद करने के लिए STOP लिखें।";
  } else if (lang === "en") {
    body = "DawaiSaathi: Please check your medicine plan. If you need help, contact your caregiver, doctor, or pharmacist. Reply STOP to stop SMS.";
  }

  if (!body) {
    await admin.from("sms_deliveries").update({ status: "failed", error_code: "language_not_enabled" }).eq("id", deliveryId).eq("status", "sending");
    return;
  }

  try {
    const sid = await sendReminderSms(delivery.to_e164, body, delivery.id);
    await admin.from("sms_deliveries").update({ status: "sent", twilio_message_sid: sid, error_code: null }).eq("id", deliveryId).eq("status", "sending");
  } catch (error: any) {
    const code = error?.code?.toString().slice(0, 80) || "send_failed";
    await admin.from("sms_deliveries").update({ status: "failed", error_code: code }).eq("id", deliveryId).eq("status", "sending");
  }
}

export async function sweepSupabaseStuckCalls() {
  const admin = createSupabaseAdminClient();
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: stuck } = await admin.from("reminder_calls").select("id").is("outcome", null).lt("updated_at", cutoff);
  if (stuck) {
    for (const call of stuck) {
      await finalizeSupabaseUnconfirmed(call.id, "not_answered");
    }
  }

  // Release orphaned claims
  const { data: openCalls } = await admin.from("reminder_calls").select("dose_event_ids_json").is("outcome", null);
  const { data: staleEvents } = await admin.from("dose_events").select("id").eq("status", "calling").lt("updated_at", cutoff);
  
  const callEventIds = new Set((openCalls || []).flatMap(c => {
    try { return JSON.parse(c.dose_event_ids_json); } catch { return []; }
  }));
  
  const orphanedIds = (staleEvents || []).map(e => e.id).filter(id => !callEventIds.has(id));
  if (orphanedIds.length > 0) {
    await admin.from("dose_events").update({ status: "scheduled", next_attempt_at_utc: nextAttempt().toISOString() }).in("id", orphanedIds).eq("status", "calling").lt("updated_at", cutoff);
  }
}
