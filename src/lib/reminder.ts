import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { buildReminderScripts, type ScriptMed, type ReminderScripts } from "@/lib/ivr/scripts";
import { getHousehold } from "@/lib/household";
import { ensureAudio } from "@/lib/tts";
import type { Patient } from "@prisma/client";
import type { FoodRelation, MedForm } from "@/types/domain";
import type { CallLanguage } from "@/lib/languages";

/** Assemble a dose slot's medicines + reminder scripts (used by preview/calls/worker/sim). */

export type SlotMeds = { meds: ScriptMed[]; foodRelation: FoodRelation };

/** Medicines scheduled at a given local time (from active schedules). */
export async function getSlotMeds(patientId: string, time: string): Promise<SlotMeds> {
  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: { patientId, status: "active" } },
    include: { medication: true },
  });

  const meds: ScriptMed[] = [];
  const foods = new Set<FoodRelation>();
  for (const s of schedules) {
    if (!parseStringArray(s.timesJson).includes(time)) continue;
    meds.push({ brandName: s.medication.brandName, count: 1, form: s.medication.form as MedForm });
    foods.add(s.foodRelation as FoodRelation);
  }
  const foodRelation: FoodRelation = foods.size === 1 ? [...foods][0] : "any";
  return { meds, foodRelation };
}

/** Medicines for a set of dose events (used at call time). */
export async function getSlotMedsForEvents(doseEventIds: string[]): Promise<SlotMeds> {
  const events = await prisma.doseEvent.findMany({
    where: { id: { in: doseEventIds } },
    include: { medication: true, schedule: true },
  });
  const meds: ScriptMed[] = [];
  const foods = new Set<FoodRelation>();
  for (const e of events) {
    meds.push({ brandName: e.medication.brandName, count: 1, form: e.medication.form as MedForm });
    if (e.schedule) foods.add(e.schedule.foodRelation as FoodRelation);
  }
  const foodRelation: FoodRelation = foods.size === 1 ? [...foods][0] : "any";
  return { meds, foodRelation };
}

export async function buildSlotScripts(
  patient: Patient,
  time: string,
  slot: SlotMeds,
): Promise<ReminderScripts> {
  const hh = await getHousehold();
  return buildReminderScripts({
    patientName: patient.name,
    time,
    meds: slot.meds,
    foodRelation: slot.foodRelation,
    language: patient.language as CallLanguage,
    caregiverName: hh?.caregiverName,
  });
}

/**
 * Warm the exact greeting/menu/closing audio for every active reminder slot.
 * A schedule save must not wait for audio at dose time, when a missed network
 * request would otherwise make the call late.
 */
export async function warmReminderAudio(patient: Patient): Promise<void> {
  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: { patientId: patient.id, status: "active" } },
    select: { timesJson: true },
  });
  const times = new Set<string>();
  for (const schedule of schedules) {
    for (const time of parseStringArray(schedule.timesJson)) times.add(time);
  }

  for (const time of times) {
    const slot = await getSlotMeds(patient.id, time);
    if (slot.meds.length === 0) continue;
    const scripts = await buildSlotScripts(patient, time, slot);
    await Promise.all(
      [scripts.greetingMedlist, scripts.menu, scripts.thanks, scripts.goodbyeNoinput].map((text) =>
        ensureAudio(text, patient.language as CallLanguage, patient.voiceGender),
      ),
    );
  }
}
