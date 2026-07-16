import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { purgeAllData } from "@/lib/data-retention";
import { runGenerics } from "@/lib/generics";
import { runInteractions } from "@/lib/interactions";
import { draftToCreateData } from "@/lib/medications";
import { buildSlotScripts, getSlotMeds } from "@/lib/reminder";
import { saveSchedules } from "@/lib/schedule";
import { ensureAudio } from "@/lib/tts";
import type { DraftMedication } from "@/types/domain";
import type { CallLanguage } from "@/lib/languages";
import { DateTime } from "luxon";

const DEMO_MEDICATIONS: DraftMedication[] = [
  demoMedication("Telma 40", "telmisartan", 40, 234, 30, 1, ["morning"]),
  demoMedication("Amlong 5", "amlodipine", 5, 106, 30, 1, ["morning"]),
  demoMedication("Glycomet 500", "metformin", 500, 35, 20, 2, ["morning", "evening"]),
  demoMedication("Ecosprin 75", "aspirin", 75, 9.3, 14, 1, ["morning"]),
  demoMedication("Warf 5", "warfarin", 5, 128, 30, 1, ["evening"]),
];

function demoMedication(
  brandName: string,
  inn: string,
  strengthValue: number,
  mrpInr: number,
  packSize: number,
  timesPerDay: number,
  timing: string[],
): DraftMedication {
  return {
    tempId: `demo_${inn}`,
    brandName,
    salts: [{ inn, fdaSearchName: inn, strengthValue, strengthUnit: "mg" }],
    form: "tablet",
    packSize,
    mrpInr,
    expiryDate: "2027-12",
    batchNumber: null,
    manufacturer: null,
    fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
    warnings: [],
    // Persistence recomputes these from highrisk_meds.csv; setting them here
    // keeps the in-memory seed data honest for callers that inspect it first.
    highRisk: inn === "warfarin",
    highRiskReason: inn === "warfarin" ? "Narrow therapeutic index — bleeding risk" : null,
    usualFrequencyHint: { timesPerDay, timing },
    displayGeneric: inn,
  };
}

/** Build the frozen Kamla Devi demo household with graceful external fallbacks. */
export async function seedDemoHousehold() {
  await purgeAllData();

  const household = await prisma.household.create({
    data: {
      caregiverName: "Priya",
      uiLanguage: "en",
      patients: {
        create: {
          name: "Kamla Devi",
          // This is only used for actual Twilio calls. A safe-looking fallback
          // keeps the simulator usable when the presenter has not configured
          // a verified number yet.
          phoneE164: config.demoPatientPhone || "+919999999999",
          language: "hi",
          voiceGender: "female",
          timezone: config.defaultTz,
        },
      },
    },
    include: { patients: true },
  });
  const patient = household.patients[0]!;

  const medications = [];
  for (const draft of DEMO_MEDICATIONS) {
    medications.push(
      await prisma.medication.create({ data: draftToCreateData(draft, patient.id) }),
    );
  }
  const byBrand = new Map(medications.map((medication) => [medication.brandName, medication]));
  const today = DateTime.now().setZone(patient.timezone).toFormat("yyyy-MM-dd");

  await saveSchedules(patient.id, patient.timezone, [
    scheduleFor(byBrand, "Telma 40", ["08:00"], "after_food", today),
    scheduleFor(byBrand, "Amlong 5", ["08:00"], "after_food", today),
    scheduleFor(byBrand, "Glycomet 500", ["08:00", "20:00"], "after_food", today),
    scheduleFor(byBrand, "Ecosprin 75", ["08:00"], "after_food", today),
    scheduleFor(byBrand, "Warf 5", ["20:00"], "any", today),
  ]);

  // Both routines write to SQLite. Keep them sequential so a demo reset never
  // creates an avoidable "database is locked" failure on a single laptop.
  const generics = await runGenerics(patient.id);
  const interactions = await runInteractions(patient.id);

  let audioWarmed = true;
  try {
    await prewarmDemoAudio(patient.id, patient.language as CallLanguage, patient.voiceGender);
  } catch {
    // The product remains demoable through the UI and a later preview can
    // retry; don't discard a complete local household for a TTS outage.
    audioWarmed = false;
  }

  return {
    household: { caregiverName: household.caregiverName, patientName: patient.name },
    medicationCount: medications.length,
    interactionCount: interactions.findings.length,
    totalMonthlySavingsInr: generics.totalMonthlySavingsInr,
    audioWarmed,
    degraded: interactions.degraded ?? null,
  };
}

function scheduleFor(
  byBrand: Map<string, { id: string }>,
  brandName: string,
  times: string[],
  foodRelation: "before_food" | "after_food" | "with_food" | "any",
  startDate: string,
) {
  const medication = byBrand.get(brandName);
  if (!medication) throw new Error(`Demo medicine missing: ${brandName}`);
  return { medicationId: medication.id, times, foodRelation, startDate };
}

async function prewarmDemoAudio(patientId: string, language: CallLanguage, voiceGender: string) {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { id: patientId } });
  for (const time of ["08:00", "20:00"]) {
    const slot = await getSlotMeds(patientId, time);
    if (slot.meds.length === 0) continue;
    const scripts = await buildSlotScripts(patient, time, slot);
    await Promise.all(
      [scripts.greetingMedlist, scripts.menu, scripts.thanks, scripts.goodbyeNoinput].map((script) =>
        ensureAudio(script, language, voiceGender),
      ),
    );
  }
}
