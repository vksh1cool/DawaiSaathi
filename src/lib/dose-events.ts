import { prisma, parseStringArray } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { utcToLocalTime, localDayBoundsUtc, utcToLocalDate, expiryStatus } from "@/lib/util/dates";
import type { TodayGroup, MedForm, FoodRelation, DoseStatus } from "@/types/domain";
import type { Patient } from "@prisma/client";
import { DateTime } from "luxon";

/** Today view + adherence + manual marking (Arch §7.5, Data-Flow §9). */

type EventWithMed = Awaited<ReturnType<typeof loadDayEvents>>[number];

async function loadDayEvents(patientId: string, startUtc: Date, endUtc: Date) {
  return prisma.doseEvent.findMany({
    where: { patientId, scheduledAtUtc: { gte: startUtc, lte: endUtc } },
    include: { medication: true, schedule: true },
    orderBy: { scheduledAtUtc: "asc" },
  });
}

function groupStatus(events: EventWithMed[]): TodayGroup["status"] {
  const statuses = events.map((e) => e.status as DoseStatus);
  if (statuses.every((s) => s === "confirmed")) return "confirmed";
  if (statuses.some((s) => s === "scheduled" || s === "calling")) return "upcoming";
  if (statuses.some((s) => s === "missed")) return "not_confirmed";
  return "mixed";
}

/** A mixed dose slot has no single safe food instruction. */
export function resolveGroupFoodRelation(
  relations: Array<FoodRelation | null | undefined>,
): FoodRelation {
  const distinct = new Set<FoodRelation>();
  for (const relation of relations) {
    if (relation) distinct.add(relation);
  }
  return distinct.size === 1 ? [...distinct][0]! : "any";
}

export async function getToday(patient: Patient): Promise<{ groups: TodayGroup[] }> {
  const tz = patient.timezone || config.defaultTz;
  const { startUtc, endUtc } = localDayBoundsUtc(tz, 0);
  const events = await loadDayEvents(patient.id, startUtc, endUtc);

  // Group by local slot time.
  const bySlot = new Map<string, EventWithMed[]>();
  for (const e of events) {
    const time = utcToLocalTime(e.scheduledAtUtc, tz);
    const arr = bySlot.get(time);
    if (arr) arr.push(e);
    else bySlot.set(time, [e]);
  }

  const groups: TodayGroup[] = Array.from(bySlot.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, evs]) => {
      // Distinct meds in this slot.
      const medMap = new Map<
        string,
        {
          brandName: string;
          count: number;
          form: MedForm;
          highRisk: boolean;
          expiryStatus: "expired" | "expiring" | "ok" | "unknown";
        }
      >();
      for (const e of evs) {
        const existing = medMap.get(e.medicationId);
        if (existing) existing.count += 1;
        else {
          medMap.set(e.medicationId, {
            brandName: e.medication.brandName,
            count: 1,
            form: e.medication.form as MedForm,
            highRisk: e.medication.highRisk,
            expiryStatus: expiryStatus(e.medication.expiryDate),
          });
        }
      }
      return {
        time,
        scheduledAtUtc: evs[0].scheduledAtUtc.toISOString(),
        status: groupStatus(evs),
        foodRelation: resolveGroupFoodRelation(
          evs.map((event) => event.schedule?.foodRelation as FoodRelation | null | undefined),
        ),
        meds: Array.from(medMap.entries()).map(([medicationId, v]) => ({ medicationId, ...v })),
        doseEventIds: evs.map((e) => e.id),
      };
    });

  return { groups };
}

export async function markDose(patientId: string, doseEventId: string, status: "confirmed" | "skipped") {
  const updated = await prisma.$transaction(async (tx) => {
    const ev = await tx.doseEvent.findFirst({ where: { id: doseEventId, patientId } });
    if (!ev) return null;

    if (status === "confirmed" && ev.status === "skipped") {
      throw new AppError("CONFLICT", "A skipped dose cannot be marked as taken.");
    }
    // A skip is only a cancellation before a call starts. Allowing
    // calling → skipped leaves a live ReminderCall with an ambiguous outcome.
    if (status === "skipped" && ev.status !== "scheduled") {
      throw new AppError("CONFLICT", "Only a pending dose can be skipped.");
    }

    // Repeating the same caregiver action is safe and should not alter the
    // original confirmation timestamp.
    if (ev.status === status) return ev;

    return tx.doseEvent.update({
      where: { id: doseEventId },
      data: {
        status,
        confirmedAtUtc: status === "confirmed" ? new Date() : null,
        confirmedVia: status === "confirmed" ? "caregiver_manual" : null,
        nextAttemptAtUtc: null,
      },
    });
  });

  if (updated?.status === "confirmed") {
    await settleCallsConfirmedByCaregiver(patientId, [doseEventId]);
  }
  return updated;
}

/**
 * Mark a whole time slot as taken in one transaction. A slot is the unit a
 * caregiver sees and hears on the reminder call, so partial client-side
 * updates would make both its status and any live call ambiguous.
 */
export async function markDoseGroupConfirmed(patientId: string, doseEventIds: string[]) {
  const ids = [...new Set(doseEventIds)];
  const updated = await prisma.$transaction(async (tx) => {
    const events = await tx.doseEvent.findMany({
      where: { id: { in: ids }, patientId },
      select: { id: true, status: true },
    });
    if (events.length !== ids.length) return null;
    if (events.some((event) => event.status === "skipped")) {
      throw new AppError("CONFLICT", "A skipped dose cannot be marked as taken.");
    }

    const pending = events.filter((event) => event.status !== "confirmed");
    const claimed = await tx.doseEvent.updateMany({
      where: { id: { in: ids }, patientId, status: { in: ["scheduled", "calling", "missed"] } },
      data: {
        status: "confirmed",
        confirmedAtUtc: new Date(),
        confirmedVia: "caregiver_manual",
        nextAttemptAtUtc: null,
      },
    });
    if (claimed.count !== pending.length) {
      throw new AppError("CONFLICT", "This dose group changed. Please refresh and try again.");
    }
    return events;
  });

  if (updated) await settleCallsConfirmedByCaregiver(patientId, ids);
  return updated;
}

/**
 * A caregiver may mark a dose taken while its IVR call is still ringing.
 * Once every event in that call is confirmed, settle the call as confirmed
 * too, so its later status webhook cannot turn an already-taken group into a
 * misleading "no input" call-log entry.
 */
async function settleCallsConfirmedByCaregiver(patientId: string, doseEventIds: string[]) {
  const openCalls = await prisma.reminderCall.findMany({
    where: { patientId, outcome: null },
    select: { id: true, doseEventIdsJson: true },
  });

  for (const call of openCalls) {
    const ids = parseStringArray(call.doseEventIdsJson);
    if (ids.length === 0 || !ids.some((id) => doseEventIds.includes(id))) continue;

    const confirmed = await prisma.doseEvent.count({
      where: { id: { in: ids }, patientId, status: "confirmed" },
    });
    if (confirmed === ids.length) {
      await prisma.reminderCall.updateMany({
        where: { id: call.id, outcome: null },
        data: { outcome: "confirmed" },
      });
    }
  }
}

export async function getAdherence(patient: Patient, days: number) {
  const tz = patient.timezone || config.defaultTz;
  const start = DateTime.now().setZone(tz).startOf("day").minus({ days: days - 1 });
  const startUtc = start.toUTC().toJSDate();
  const endUtc = DateTime.now().setZone(tz).endOf("day").toUTC().toJSDate();

  const events = await prisma.doseEvent.findMany({
    where: { patientId: patient.id, scheduledAtUtc: { gte: startUtc, lte: endUtc } },
  });

  let confirmed = 0;
  let notConfirmed = 0;
  const byDayMap = new Map<string, { confirmed: number; notConfirmed: number; pending: number }>();
  for (let i = 0; i < days; i++) {
    const d = start.plus({ days: i }).toFormat("yyyy-MM-dd");
    byDayMap.set(d, { confirmed: 0, notConfirmed: 0, pending: 0 });
  }

  for (const e of events) {
    const d = utcToLocalDate(e.scheduledAtUtc, tz);
    const bucket = byDayMap.get(d);
    if (!bucket) continue;
    if (e.status === "confirmed") {
      confirmed += 1;
      bucket.confirmed += 1;
    } else if (e.status === "missed") {
      notConfirmed += 1;
      bucket.notConfirmed += 1;
    } else if (e.status === "scheduled" || e.status === "calling") {
      bucket.pending += 1;
    }
  }

  const denom = confirmed + notConfirmed;
  const confirmationRate = denom === 0 ? null : Math.round((confirmed / denom) * 100);
  return {
    confirmationRate,
    confirmed,
    notConfirmed,
    byDay: Array.from(byDayMap.entries()).map(([date, v]) => ({ date, ...v })),
  };
}
