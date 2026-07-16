import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { ensureAudio } from "@/lib/tts";
import { placeCall } from "@/lib/twilio";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import { getSlotMedsForEvents } from "@/lib/reminder";
import { getHousehold } from "@/lib/household";
import { utcToLocalTime, slotLabel } from "@/lib/util/dates";
import { isCallLanguage, twilioVoiceLocale, type CallLanguage } from "@/lib/languages";
import type { Patient, ReminderCall } from "@prisma/client";

/** Shared reminder-call logic used by the worker, webhooks, and simulator (Arch §10, §12.3). */

export type AudioFallbacks = {
  medlist: string;
  menu: string;
  thanks: string;
  noinput: string;
};

/**
 * An asset is nullable only when OpenAI TTS was unavailable and no cached
 * file existed. Twilio then uses the paired, localized `<Say>` fallback
 * instead of abandoning a real reminder call (Data-Flow §12).
 */
export type AudioSet = {
  language: CallLanguage;
  medlist: string | null;
  menu: string | null;
  thanks: string | null;
  noinput: string | null;
  fallback: AudioFallbacks;
};

export type AudioUrls = {
  medlistUrl: string | null;
  menuUrl: string | null;
  thanksUrl: string | null;
  noinputUrl: string | null;
};

export type PlaceResult = {
  reminderCallId: string;
  audioSet: AudioSet;
  audioUrls: AudioUrls;
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
  const candidateEvents = await prisma.doseEvent.findMany({
    where: { id: { in: doseEventIds }, patientId: patient.id, status: "scheduled" },
    select: { id: true, attempts: true },
  });
  if (candidateEvents.length === 0) {
    throw new AppError("CONFLICT", "This reminder is already being handled.");
  }

  // A mixed group can occur when a caregiver has already marked one medicine
  // taken. Only the still-scheduled medicines are included in the call.
  const pendingDoseEventIds = candidateEvents.map((event) => event.id);
  const tz = patient.timezone || config.defaultTz;
  const time = utcToLocalTime(scheduledAtUtc, tz);

  const slot = await getSlotMedsForEvents(pendingDoseEventIds);
  const hh = await getHousehold();
  const scripts = buildReminderScripts({
    patientName: patient.name,
    time,
    meds: slot.meds,
    foodRelation: slot.foodRelation,
    language: patient.language as CallLanguage,
    caregiverName: hh?.caregiverName,
  });

  const lang = patient.language as CallLanguage;
  const [medlist, menu, thanks, noinput] = await Promise.all([
    ensureAudioOrFallback(scripts.greetingMedlist, lang, patient.voiceGender, "medlist"),
    ensureAudioOrFallback(scripts.menu, lang, patient.voiceGender, "menu"),
    ensureAudioOrFallback(scripts.thanks, lang, patient.voiceGender, "thanks"),
    ensureAudioOrFallback(scripts.goodbyeNoinput, lang, patient.voiceGender, "noinput"),
  ]);
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

  // Twilio <Say> has no locale for every language we support in the browser.
  // For those languages a real phone call is safe only when every clip was
  // generated successfully; never substitute another spoken language for a
  // medicine instruction. The simulator remains available through device TTS.
  if (
    mode === "twilio" &&
    !twilioVoiceLocale(lang) &&
    [audioSet.medlist, audioSet.menu, audioSet.thanks, audioSet.noinput].some((clip) => !clip)
  ) {
    throw new AppError(
      "TTS_UNAVAILABLE",
      "This reminder language needs generated call audio before a phone reminder can be placed. Try again after voice audio is available.",
    );
  }

  // Claim the entire pending group atomically before creating a call. This
  // protects against a manual demo trigger racing the worker (or a double tap
  // in the UI) and is the only point at which scheduled -> calling may occur.
  const call = await prisma.$transaction(async (tx) => {
    const current = await tx.doseEvent.findMany({
      where: { id: { in: pendingDoseEventIds }, patientId: patient.id, status: "scheduled" },
      select: { id: true, attempts: true },
    });
    if (current.length !== pendingDoseEventIds.length) {
      throw new AppError("CONFLICT", "This reminder is already being handled.");
    }

    const attempt = Math.min(...current.map((event) => event.attempts)) + 1;
    await tx.doseEvent.updateMany({
      where: { id: { in: pendingDoseEventIds }, status: "scheduled" },
      data: { status: "calling", nextAttemptAtUtc: null },
    });
    return tx.reminderCall.create({
      data: {
        patientId: patient.id,
        scheduledAtUtc,
        doseEventIdsJson: JSON.stringify(pendingDoseEventIds),
        attempt,
        mode,
        audioFile: JSON.stringify(audioSet),
      },
    });
  });

  let placed = mode === "simulated";
  if (mode === "twilio") {
    try {
      const sid = await placeCall(patient.phoneE164, call.id);
      await prisma.reminderCall.update({ where: { id: call.id }, data: { twilioCallSid: sid } });
      placed = true;
      logger.info({ callId: call.id, attempt: call.attempt }, "reminder call placed");
    } catch (err) {
      // Revert: try again next tick.
      await prisma.doseEvent.updateMany({
        where: { id: { in: pendingDoseEventIds }, status: "calling" },
        data: { status: "scheduled", nextAttemptAtUtc: nextAttempt() },
      });
      await prisma.reminderCall.update({ where: { id: call.id }, data: { outcome: "failed" } });
      logger.error({ err, callId: call.id }, "reminder call failed to place");
    }
  }

  const url = (f: string | null) => (f ? `/api/audio/${f}` : null);
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
  const genericFallback: AudioFallbacks = {
    medlist:
      "Hello, this is DawaiSaathi with your medicine reminder. Please follow the instructions your doctor or pharmacist gave you.",
    menu: "After taking your medicines, press 1. To hear this again, press 2.",
    thanks: "Your dose is recorded. Confirm any medicine changes with your doctor or pharmacist. Goodbye.",
    noinput:
      "Please follow the instructions your doctor or pharmacist gave you. We will call again shortly. Goodbye.",
  };
  try {
    const stored = JSON.parse(call.audioFile) as Partial<AudioSet>;
    return {
      language: isCallLanguage(stored.language) ? stored.language : "en",
      medlist: typeof stored.medlist === "string" ? stored.medlist : null,
      menu: typeof stored.menu === "string" ? stored.menu : null,
      thanks: typeof stored.thanks === "string" ? stored.thanks : null,
      noinput: typeof stored.noinput === "string" ? stored.noinput : null,
      fallback:
        stored.fallback &&
        typeof stored.fallback.medlist === "string" &&
        typeof stored.fallback.menu === "string" &&
        typeof stored.fallback.thanks === "string" &&
        typeof stored.fallback.noinput === "string"
          ? stored.fallback
          : genericFallback,
    };
  } catch (err) {
    logger.warn({ err, callId: call.id }, "invalid reminder audio metadata — using voice fallback");
    return { language: "en", medlist: null, menu: null, thanks: null, noinput: null, fallback: genericFallback };
  }
}

async function ensureAudioOrFallback(
  text: string,
  language: CallLanguage,
  voiceGender: string,
  clip: keyof AudioFallbacks,
): Promise<string | null> {
  try {
    const audio = await ensureAudio(text, language, voiceGender);
    return `${audio.hash}.mp3`;
  } catch (err) {
    logger.warn({ err, clip, language }, "TTS unavailable — using voice fallback");
    return null;
  }
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
  return prisma.$transaction(async (tx) => {
    const call = await tx.reminderCall.findUnique({ where: { id: callId } });
    if (!call) return null;

    // Gather/status webhooks are delivered at least once. A duplicate keypress
    // must report the settled result without mutating dose events again.
    if (call.outcome === "confirmed") return { action: "confirmed" as const, call };
    if (call.outcome) return { action: "noinput" as const, call };

    const doseEventIds = parseStringArray(call.doseEventIdsJson);
    if (digits === "1") {
      const events = await tx.doseEvent.findMany({
        where: { id: { in: doseEventIds } },
        select: { id: true, status: true },
      });
      const eligible =
        events.length === doseEventIds.length &&
        events.every((event) => event.status === "calling" || event.status === "confirmed");
      if (!eligible) return { action: "noinput" as const, call };

      const claimed = await tx.reminderCall.updateMany({
        where: { id: callId, outcome: null },
        data: { outcome: "confirmed", digitsPressed: "1" },
      });
      if (claimed.count === 0) {
        const settled = await tx.reminderCall.findUniqueOrThrow({ where: { id: callId } });
        return { action: settled.outcome === "confirmed" ? "confirmed" as const : "noinput" as const, call: settled };
      }

      const via = call.mode === "simulated" ? "simulated" : "ivr_dtmf";
      await tx.doseEvent.updateMany({
        where: { id: { in: doseEventIds }, status: "calling" },
        data: { status: "confirmed", confirmedVia: via, confirmedAtUtc: new Date() },
      });
      const updated = await tx.reminderCall.findUniqueOrThrow({ where: { id: callId } });
      return { action: "confirmed" as const, call: updated };
    }

    if (digits === "2" && call.replayCount < 1) {
      const claimed = await tx.reminderCall.updateMany({
        where: { id: callId, outcome: null, replayCount: { lt: 1 } },
        data: { replayCount: { increment: 1 }, digitsPressed: "2" },
      });
      if (claimed.count > 0) {
        const updated = await tx.reminderCall.findUniqueOrThrow({ where: { id: callId } });
        return { action: "repeat" as const, call: updated };
      }
    }

    return { action: "noinput" as const, call };
  });
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
  await prisma.$transaction(async (tx) => {
    const call = await tx.reminderCall.findUnique({ where: { id: callId } });
    if (!call || call.outcome !== null) return;

    // Claim finalization before touching attempts. Status callbacks and the
    // stuck-call sweep can race; only one may consume a retry.
    const claimed = await tx.reminderCall.updateMany({
      where: { id: callId, outcome: null },
      data: { outcome },
    });
    if (claimed.count === 0) return;

    const doseEventIds = parseStringArray(call.doseEventIdsJson);
    const events = await tx.doseEvent.findMany({ where: { id: { in: doseEventIds } } });
    const missed: string[] = [];

    for (const event of events) {
      if (event.status !== "calling") continue;
      const attempts = event.attempts + 1;
      if (attempts < config.maxCallAttempts) {
        await tx.doseEvent.update({
          where: { id: event.id },
          data: { status: "scheduled", attempts, nextAttemptAtUtc: nextAttempt() },
        });
      } else {
        await tx.doseEvent.update({
          where: { id: event.id },
          data: { status: "missed", attempts, nextAttemptAtUtc: null },
        });
        missed.push(event.id);
      }
    }

    if (missed.length > 0) {
      await createMissedAlert(tx, call.patientId, call.scheduledAtUtc, missed);
    }
  });
}

async function createMissedAlert(
  tx: Prisma.TransactionClient,
  patientId: string,
  scheduledAtUtc: Date,
  doseEventIds: string[],
) {
  const patient = await tx.patient.findUnique({ where: { id: patientId } });
  if (!patient) return;
  const tz = patient.timezone || config.defaultTz;
  const time = utcToLocalTime(scheduledAtUtc, tz);
  const enLbl = slotLabel(time, "en");
  const hiLbl = slotLabel(time, "hi");
  const n = config.maxCallAttempts;

  await tx.caregiverAlert.create({
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
    where: { outcome: null, updatedAt: { lt: cutoff } },
  });
  for (const call of stuck) {
    logger.warn({ callId: call.id }, "sweeping stuck call");
    await finalizeUnconfirmed(call.id, "not_answered");
  }
}
