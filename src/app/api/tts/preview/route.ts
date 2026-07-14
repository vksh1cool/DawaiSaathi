import { NextResponse } from "next/server";
import { withErrorBoundary, AppError } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getSlotMeds, buildSlotScripts } from "@/lib/reminder";
import { ensureAudio } from "@/lib/tts";
import { timeBodySchema } from "@/lib/validation";
import type { Language } from "@/types/domain";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/tts/preview — the exact reminder audio for a slot (Arch §7.7, US-8). */
export const POST = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const { time } = timeBodySchema.parse(await req.json());

  const slot = await getSlotMeds(patient.id, time);
  if (slot.meds.length === 0) {
    throw new AppError("VALIDATION", "No medicines are scheduled at this time yet.");
  }
  const scripts = await buildSlotScripts(patient, time, slot);
  const audio = await ensureAudio(scripts.greetingMedlist, patient.language as Language, patient.voiceGender);

  return NextResponse.json({ audioUrl: audio.url, scriptText: scripts.greetingMedlist });
});
