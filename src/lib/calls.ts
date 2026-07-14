import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { ensureAudio } from "@/lib/tts";
import { placeCall } from "@/lib/twilio";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import { getSlotMedsForEvents } from "@/lib/reminder";
import { getHousehold } from "@/lib/household";
import { utcToLocalTime, slotLabel } from "@/lib/util/dates";
import type { Patient, ReminderCall } from "@prisma/client";
import type { Language } from "@/types/domain";

/** Shared reminder-call logic used by the worker, webhooks, and simulator (Arch §10, §12.3). */

export type AudioSet = { medlist: string; menu: string; thanks: string; noinput: string };

export type PlaceResult = {
  reminderCallId: string;
  audioSet: AudioSet;
  audioUrls: { medlistUrl: string; menuUrl: string; thanksUrl: string; noinputUrl: string };
  placed: boolean;
};

/** Place (or prepare, for simulated) one grouped reminder call. */
export async function placeGroupReminder(opts: {
  patient: Patient;
  doseEventIds: string[];
  scheduledAtUtc: Date;
  mode: "twilio" | "simulated";
}): Promise<PlaceResult> {
  const { patient, doseEventIds, scheduledAtUtc, mode } = opts;
  const tz = patient.timezone || config.defaultTz;
  const time = utcToLocalTime(scheduledAtUtc, tz);

  const slot = await getSlotMedsForEvents(doseEventIds);
  const hh = await getHousehold();
  const scripts = buildReminderScripts({
    patientName: patient.name,
    time,
    meds: slot.meds,
    foodRelation: slot.foodRelation,
    language: patient.language as Language,
    caregiverName: hh?.caregiverName,
  });

  const lang = patient.language as Language;
  const [medlist, menu, thanks, noinput] = await Promise.all([
    ensureAudio(scripts.greetingMedlist, lang, patient.voiceGender),
    ensureAudio(scripts.menu, lang, patient.voiceGender),
    ensureAudio(scripts.thanks, lang, patient.voiceGender),
    ensureAudio(scripts.goodbyeNoinput, lang, patient.voiceGender),
  ]);
  const audioSet: AudioSet = {
    medlist: `${medlist.hash}.mp3`,
    menu: `${menu.hash}.mp3`,
    thanks: `${thanks.hash}.mp3`,
    noinput: `${noinput.hash}.mp3`,
  };

  const events = await prisma.doseEvent.findMany({ where: { id: { in: doseEventIds } } });
  const attempt = Math.min(...events.map((e) => e.attempts)) + 1;

  const call = await prisma.reminderCall.create({
    data: {
      patientId: patient.id,
      scheduledAtUtc,
      doseEventIdsJson: JSON.stringify(doseEventIds),
      attempt,
      mode,
      audioFile: JSON.stringify(audioSet),
    },
  });

  await prisma.doseEvent.updateMany({
    where: { id: { in: doseEventIds } },
    data: { status: "calling", nextAttemptAtUtc: null },
  });

  let placed = mode === "simulated";
  if (mode === "twilio") {
    try {
      const sid = await placeCall(patient.phoneE164, call.id);
      await prisma.reminderCall.update({ where: { id: call.id }, data: { twilioCallSid: sid } });
      placed = true;
      logger.info({ callId: call.id, attempt }, "reminder call placed");
    } catch (err) {
      // Revert: try again next tick.
      await prisma.doseEvent.updateMany({
        where: { id: { in: doseEventIds } },
        data: { status: "scheduled", nextAttemptAtUtc: nextAttempt() },
      });
      await prisma.reminderCall.update({ where: { id: call.id }, data: { outcome: "failed" } });
      logger.error({ err, callId: call.id }, "reminder call failed to place");
    }
  }

  const url = (f: string) => `/api/audio/${f}`;
  return {
    reminderCallId: call.id,
    audioSet,
    audioUrls: {
      medlistUrl: url(audioSet.medlist),
      menuUrl: url(audioSet.menu),
      thanksUrl: url(audioSet.thanks),
      noinputUrl: url(audioSet.noinput),
    },
    placed,
  };
}

export function getAudioSet(call: ReminderCall): AudioSet {
  return JSON.parse(call.audioFile) as AudioSet;
}

export type GatherAction = "confirmed" | "repeat" | "noinput";

/**
 * Handle a DTMF/simulated keypress. Same code path for Twilio + simulator (AC-10.1).
 * Returns the action; the caller renders TwiML / UI accordingly.
 */
export async function handleGatherResult(
  callId: string,
  digits: string,
): Promise<{ action: GatherAction; call: ReminderCall } | null> {
  const call = await prisma.reminderCall.findUnique({ where: { id: callId } });
  if (!call) return null;
  const doseEventIds = parseStringArray(call.doseEventIdsJson);

  if (digits === "1") {
    const via = call.mode === "simulated" ? "simulated" : "ivr_dtmf";
    await prisma.doseEvent.updateMany({
      where: { id: { in: doseEventIds } },
      data: { status: "confirmed", confirmedVia: via, confirmedAtUtc: new Date() },
    });
    const updated = await prisma.reminderCall.update({
      where: { id: callId },
      data: { outcome: "confirmed", digitsPressed: "1" },
    });
    return { action: "confirmed", call: updated };
  }

  if (digits === "2" && call.replayCount < 1) {
    const updated = await prisma.reminderCall.update({
      where: { id: callId },
      data: { replayCount: { increment: 1 }, digitsPressed: "2" },
    });
    return { action: "repeat", call: updated };
  }

  return { action: "noinput", call };
}

const nextAttempt = () => new Date(Date.now() + config.retryDelayMinutes * 60 * 1000);

/**
 * Retry-or-missed after a call concludes unconfirmed (Arch §12.3).
 * Idempotent: no-op if already confirmed.
 */
export async function finalizeUnconfirmed(
  callId: string,
  outcome: "no_input" | "not_answered" | "failed" = "no_input",
): Promise<void> {
  const call = await prisma.reminderCall.findUnique({ where: { id: callId } });
  if (!call || call.outcome === "confirmed") return;

  await prisma.reminderCall.update({
    where: { id: callId },
    data: { outcome: call.outcome ?? outcome },
  });

  const doseEventIds = parseStringArray(call.doseEventIdsJson);
  const events = await prisma.doseEvent.findMany({ where: { id: { in: doseEventIds } } });
  const missed: string[] = [];

  for (const ev of events) {
    if (ev.status === "confirmed" || ev.status === "skipped") continue;
    const attempts = ev.attempts + 1;
    if (attempts < config.maxCallAttempts) {
      await prisma.doseEvent.update({
        where: { id: ev.id },
        data: { status: "scheduled", attempts, nextAttemptAtUtc: nextAttempt() },
      });
    } else {
      await prisma.doseEvent.update({
        where: { id: ev.id },
        data: { status: "missed", attempts, nextAttemptAtUtc: null },
      });
      missed.push(ev.id);
    }
  }

  if (missed.length > 0) await createMissedAlert(call.patientId, call.scheduledAtUtc, missed);
}

async function createMissedAlert(patientId: string, scheduledAtUtc: Date, doseEventIds: string[]) {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const tz = patient.timezone || config.defaultTz;
  const time = utcToLocalTime(scheduledAtUtc, tz);
  const enLbl = slotLabel(time, "en");
  const hiLbl = slotLabel(time, "hi");
  const n = config.maxCallAttempts;

  await prisma.caregiverAlert.create({
    data: {
      patientId,
      type: "missed_dose",
      doseEventIdsJson: JSON.stringify(doseEventIds),
      messageEn: `${patient.name} did not confirm the ${enLbl} medicines (${n} calls tried).`,
      messageHi: `${patient.name} जी ने ${hiLbl} की दवाई की पुष्टि नहीं की (${n} बार फ़ोन किया गया)।`,
    },
  });
}

/** Sweep calls stuck in "calling" >5 min (lost webhooks) — Arch §12.3. */
export async function sweepStuckCalls(): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  const stuck = await prisma.reminderCall.findMany({
    where: { mode: "twilio", outcome: null, updatedAt: { lt: cutoff } },
  });
  for (const call of stuck) {
    logger.warn({ callId: call.id }, "sweeping stuck call");
    await finalizeUnconfirmed(call.id, "not_answered");
  }
}
