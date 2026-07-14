/**
 * Pre-generate reminder audio for the demo patient so calls have zero latency
 * (PRD risk table, Day-3 demo prep). Requires OPENAI_API_KEY.
 *   npm run pregen-audio
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { parseStringArray } from "../src/lib/db";
import { getHousehold } from "../src/lib/household";
import { getSlotMeds, buildSlotScripts } from "../src/lib/reminder";
import { ensureAudio } from "../src/lib/tts";
import type { Language } from "../src/types/domain";

async function main() {
  const hh = await getHousehold();
  const patient = hh?.patients[0];
  if (!patient) {
    console.log("No household yet. Run the demo seed first (npm run demo:seed).");
    return;
  }
  const lang = patient.language as Language;

  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: { patientId: patient.id, status: "active" } },
  });
  const times = new Set<string>();
  for (const s of schedules) parseStringArray(s.timesJson).forEach((t) => times.add(t));

  let count = 0;
  for (const time of times) {
    const slot = await getSlotMeds(patient.id, time);
    if (slot.meds.length === 0) continue;
    const scripts = await buildSlotScripts(patient, time, slot);
    for (const text of [scripts.greetingMedlist, scripts.menu, scripts.thanks, scripts.goodbyeNoinput]) {
      await ensureAudio(text, lang, patient.voiceGender);
      count += 1;
    }
    console.log(`  warmed ${time}: ${slot.meds.map((m) => m.brandName).join(", ")}`);
  }
  console.log(`✓ Pre-generated ${count} audio clips for ${patient.name}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
