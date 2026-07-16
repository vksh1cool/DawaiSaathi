import { prisma } from "@/lib/db";
import { parseSalts, parseFrequencyHint, parseStringArray } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { computeSpecialCheck } from "@/lib/medications";
import { warmReminderAudio } from "@/lib/reminder";
import { callLLM } from "@/lib/openai";
import { SCHEDULE_SYSTEM, SCHEDULE_SCHEMA, scheduleZod } from "@/lib/prompts";
import { utcToLocalDate, zonedToUtc } from "@/lib/util/dates";
import { localDateRange } from "@/lib/util/dates";
import type { ScheduleSuggestion, FoodRelation } from "@/types/domain";
import { DateTime } from "luxon";

/** Schedule suggestions + DoseEvent materialization (Arch §8.5, §12.2). */

const ANCHOR: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["08:00", "14:00", "20:00", "22:00"],
};

/** Deterministic fallback used when the LLM is unavailable. */
function fallbackSuggestion(timesPerDay: number | null): { times: string[]; lowConfidence: boolean } {
  if (!timesPerDay) return { times: ["08:00"], lowConfidence: true };
  return { times: ANCHOR[Math.min(timesPerDay, 4)] ?? ["08:00"], lowConfidence: false };
}

export async function suggestSchedules(patientId: string): Promise<ScheduleSuggestion[]> {
  const meds = await prisma.medication.findMany({
    where: { patientId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (meds.length === 0) return [];

  const input = meds.map((m) => ({
    displayGeneric: m.displayGeneric,
    salts: parseSalts(m).map((s) => s.inn),
    usualFrequencyHint: parseFrequencyHint(m),
  }));

  try {
    const { suggestions } = await callLLM({
      system: SCHEDULE_SYSTEM,
      content: [{ type: "text", text: JSON.stringify(input) }],
      schemaName: "schedule_suggestion",
      jsonSchema: SCHEDULE_SCHEMA,
      zodSchema: scheduleZod,
    });
    return meds.map((m, i) => ({
      medicationId: m.id,
      times: suggestions[i]?.times ?? ["08:00"],
      foodRelation: (suggestions[i]?.foodRelation ?? "any") as FoodRelation,
      lowConfidence: suggestions[i]?.lowConfidence ?? true,
    }));
  } catch (err) {
    logger.warn({ err }, "schedule suggestion LLM failed — deterministic fallback");
    return meds.map((m) => {
      const hint = parseFrequencyHint(m);
      const fb = fallbackSuggestion(hint?.timesPerDay ?? null);
      return { medicationId: m.id, times: fb.times, foodRelation: "any", lowConfidence: fb.lowConfidence };
    });
  }
}

export type ScheduleInput = {
  medicationId: string;
  times: string[];
  foodRelation: FoodRelation;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null;
};

/** Upsert schedules (one active per medication) then materialize (Arch §7.5). */
export async function saveSchedules(
  patientId: string,
  tz: string,
  inputs: ScheduleInput[],
  weeklyOverridePatientName?: string,
) {
  const medIds = inputs.map((i) => i.medicationId);
  // Verify every requested medicine belongs to this patient. Silently
  // discarding unknown IDs makes a partially-saved regimen dangerously hard
  // to notice.
  const owned = await prisma.medication.findMany({
    where: { id: { in: medIds }, patientId },
    select: { id: true, saltsJson: true },
  });
  const ownedIds = new Set(owned.map((m) => m.id));
  if (ownedIds.size !== new Set(medIds).size) {
    throw new AppError("VALIDATION", "One or more medicines do not belong to this household.");
  }

  const dailyMethotrexate = owned.filter((med) =>
    inputs.some(
      (input) =>
        input.medicationId === med.id &&
        input.times.length > 0 &&
        computeSpecialCheck(parseSalts(med)) === "weekly_check",
    ),
  );
  if (dailyMethotrexate.length > 0) {
    const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { name: true } });
    const overrideMatches =
      !!patient &&
      weeklyOverridePatientName?.trim().toLocaleLowerCase() === patient.name.trim().toLocaleLowerCase();
    if (!overrideMatches) {
      throw new AppError(
        "VALIDATION",
        "Methotrexate is usually taken weekly, not daily. Confirm the schedule with the doctor before continuing.",
      );
    }
  }

  const activeSchedules = await prisma.schedule.findMany({
    where: { medicationId: { in: medIds }, active: true },
    select: { id: true },
  });
  const activeIds = activeSchedules.map((schedule) => schedule.id);
  if (activeIds.length > 0) {
    const callsInProgress = await prisma.doseEvent.count({
      where: { scheduleId: { in: activeIds }, status: "calling" },
    });
    if (callsInProgress > 0) {
      throw new AppError(
        "CONFLICT",
        "A reminder call is in progress. Update this schedule after the call finishes.",
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const input of inputs) {
      const oldSchedules = await tx.schedule.findMany({
        where: { medicationId: input.medicationId, active: true },
        select: { id: true },
      });
      const oldScheduleIds = oldSchedules.map((schedule) => schedule.id);
      if (oldScheduleIds.length > 0) {
        // Existing DoseEvents are immutable history, but pending events from a
        // replaced schedule must not later trigger a stale or duplicate call.
        await tx.doseEvent.updateMany({
          where: {
            scheduleId: { in: oldScheduleIds },
            status: "scheduled",
            scheduledAtUtc: { gte: new Date() },
          },
          data: { status: "skipped", nextAttemptAtUtc: null },
        });
      }
      await tx.schedule.updateMany({
        where: { medicationId: input.medicationId, active: true },
        data: { active: false },
      });
      // A caregiver can clear every time chip to stop reminders for this one
      // medicine. Deactivate the old schedule and do not replace it with an
      // empty active row.
      if (input.times.length === 0) continue;
      await tx.schedule.create({
        data: {
          medicationId: input.medicationId,
          timesJson: JSON.stringify(input.times),
          foodRelation: input.foodRelation,
          startDate: zonedToUtc(input.startDate, "00:00", tz),
          endDate: input.endDate ? zonedToUtc(input.endDate, "23:59", tz) : null,
          active: true,
        },
      });
    }
  });

  await materializeDoseEvents(patientId);

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (patient && config.openAiTtsEnabled) {
    // Audio is a cache optimization, never a reason to make a caregiver wait
    // after a safety-sensitive schedule save. Calls have localized Twilio and
    // browser-speech fallbacks if this best-effort warm-up is interrupted.
    void warmReminderAudio(patient).catch((err) => {
      logger.warn({ err, patientId }, "schedule audio warm-up failed");
    });
  }
}

/** Active schedules, with date-only values restored to the patient's timezone. */
export async function getActiveSchedules(patientId: string, tz: string) {
  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: { patientId, status: "active" } },
    include: { medication: { select: { id: true, brandName: true, displayGeneric: true } } },
    orderBy: { createdAt: "asc" },
  });
  return schedules.map((schedule) => ({
    id: schedule.id,
    medicationId: schedule.medicationId,
    medication: schedule.medication,
    times: parseStringArray(schedule.timesJson),
    foodRelation: schedule.foodRelation,
    startDate: utcToLocalDate(schedule.startDate, tz),
    endDate: schedule.endDate ? utcToLocalDate(schedule.endDate, tz) : null,
  }));
}

/**
 * Create DoseEvents for today+tomorrow, idempotently (Arch §12.2).
 * Called by the worker tick and after schedule changes.
 */
export async function materializeDoseEvents(patientId?: string): Promise<number> {
  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: patientId ? { patientId } : undefined },
    include: { medication: { include: { patient: true } } },
  });

  const now = new Date();
  const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);
  let created = 0;

  for (const sched of schedules) {
    const med = sched.medication;
    if (med.status !== "active") continue;
    const patient = med.patient;
    const tz = patient.timezone || config.defaultTz;
    const times = parseStringArray(sched.timesJson);
    const days = localDateRange(tz, 2); // today + tomorrow

    for (const day of days) {
      for (const time of times) {
        const scheduledAtUtc = zonedToUtc(day, time, tz);
        if (scheduledAtUtc < staleCutoff) continue;
        // Respect schedule start/end bounds.
        if (sched.startDate && scheduledAtUtc < startOfDay(sched.startDate, tz)) continue;
        if (sched.endDate && scheduledAtUtc > sched.endDate) continue;

        const existing = await prisma.doseEvent.findUnique({
          where: { scheduleId_scheduledAtUtc: { scheduleId: sched.id, scheduledAtUtc } },
          select: { id: true },
        });
        if (!existing) {
          await prisma.doseEvent.create({
            data: {
              scheduleId: sched.id,
              medicationId: med.id,
              patientId: patient.id,
              scheduledAtUtc,
              status: "scheduled",
            },
          });
          created += 1;
        }
      }
    }
  }
  return created;
}

function startOfDay(d: Date, tz: string): Date {
  return DateTime.fromJSDate(d, { zone: "utc" }).setZone(tz).startOf("day").toUTC().toJSDate();
}
