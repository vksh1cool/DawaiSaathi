import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { config } from "@/lib/config";
import { getPatientOrThrow } from "@/lib/household";
import { getToday } from "@/lib/dose-events";
import { placeGroupReminder } from "@/lib/calls";
import { timeBodySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/simulate/start — in-browser call fallback (Arch §7.7, AC-10). */
export const POST = withErrorBoundary(async (req: Request) => {
  if (!config.demoMode) throw new AppError("NOT_FOUND", "Not available.");
  const patient = await getPatientOrThrow();
  const { time } = timeBodySchema.parse(await req.json());

  const { groups } = await getToday(patient);
  const group = groups.find((g) => g.time === time);
  if (!group || group.status !== "upcoming") {
    throw new AppError("VALIDATION", "No pending medicines are scheduled at that time today.");
  }

  const result = await placeGroupReminder({
    patient,
    doseEventIds: group.doseEventIds,
    scheduledAtUtc: new Date(group.scheduledAtUtc),
    mode: "simulated",
  });

  return NextResponse.json({
    reminderCallId: result.reminderCallId,
    audio: {
      ...result.audioUrls,
      language: result.audioSet.language,
      // Lets the in-browser fallback voice match the patient's chosen gender
      // when generated audio is unavailable.
      voiceGender: patient.voiceGender,
      fallback: result.audioSet.fallback,
    },
  });
});
