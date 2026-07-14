import { prisma } from "@/lib/db";
import { parseSalts, parseFrequencyHint, parseStringArray } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { callLLM } from "@/lib/openai";
import { SCHEDULE_SYSTEM, SCHEDULE_SCHEMA, scheduleZod } from "@/lib/prompts";
import { zonedToUtc } from "@/lib/util/dates";
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
export async function saveSchedules(patientId: string, tz: string, inputs: ScheduleInput[]) {
  const medIds = inputs.map((i) => i.medicationId);
  // Verify meds belong to this patient.
  const owned = await prisma.medication.findMany({
    where: { id: { in: medIds }, patientId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((m) => m.id));

  await prisma.$transaction(async (tx) => {
    for (const input of inputs) {
      if (!ownedIds.has(input.medicationId)) continue;
      await tx.schedule.updateMany({
        where: { medicationId: input.medicationId, active: true },
        data: { active: false },
      });
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

        try {
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
        } catch {
          // Unique (scheduleId, scheduledAtUtc) → already materialized. Idempotent.
        }
      }
    }
  }
  return created;
}

function startOfDay(d: Date, tz: string): Date {
  return DateTime.fromJSDate(d, { zone: "utc" }).setZone(tz).startOf("day").toUTC().toJSDate();
}
