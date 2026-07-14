import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { utcToLocalTime, localDayBoundsUtc, utcToLocalDate } from "@/lib/util/dates";
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
  if (statuses.some((s) => s === "missed")) return "missed";
  return "mixed";
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
      const medMap = new Map<string, { brandName: string; count: number; form: MedForm }>();
      for (const e of evs) {
        const existing = medMap.get(e.medicationId);
        if (existing) existing.count += 1;
        else medMap.set(e.medicationId, { brandName: e.medication.brandName, count: 1, form: e.medication.form as MedForm });
      }
      return {
        time,
        scheduledAtUtc: evs[0].scheduledAtUtc.toISOString(),
        status: groupStatus(evs),
        foodRelation: (evs[0].schedule?.foodRelation ?? "any") as FoodRelation,
        meds: Array.from(medMap.entries()).map(([medicationId, v]) => ({ medicationId, ...v })),
        doseEventIds: evs.map((e) => e.id),
      };
    });

  return { groups };
}

export async function markDose(patientId: string, doseEventId: string, status: "confirmed" | "skipped") {
  const ev = await prisma.doseEvent.findFirst({ where: { id: doseEventId, patientId } });
  if (!ev) return null;
  return prisma.doseEvent.update({
    where: { id: doseEventId },
    data: {
      status,
      confirmedAtUtc: status === "confirmed" ? new Date() : null,
      confirmedVia: status === "confirmed" ? "caregiver_manual" : null,
    },
  });
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
  let missed = 0;
  const byDayMap = new Map<string, { confirmed: number; missed: number; pending: number }>();
  for (let i = 0; i < days; i++) {
    const d = start.plus({ days: i }).toFormat("yyyy-MM-dd");
    byDayMap.set(d, { confirmed: 0, missed: 0, pending: 0 });
  }

  for (const e of events) {
    const d = utcToLocalDate(e.scheduledAtUtc, tz);
    const bucket = byDayMap.get(d);
    if (!bucket) continue;
    if (e.status === "confirmed") {
      confirmed += 1;
      bucket.confirmed += 1;
    } else if (e.status === "missed") {
      missed += 1;
      bucket.missed += 1;
    } else if (e.status === "scheduled" || e.status === "calling") {
      bucket.pending += 1;
    }
  }

  const denom = confirmed + missed;
  const percent = denom === 0 ? 100 : Math.round((confirmed / denom) * 100);
  return {
    percent,
    confirmed,
    missed,
    byDay: Array.from(byDayMap.entries()).map(([date, v]) => ({ date, ...v })),
  };
}
