import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { config } from "@/lib/config";
import { getPatientOrThrow } from "@/lib/household";
import { getToday } from "@/lib/dose-events";
import { placeGroupReminder } from "@/lib/calls";
import { timeBodySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/calls/now — trigger a real reminder call immediately (DEMO_MODE, Arch §7.7). */
export const POST = withErrorBoundary(async (req: Request) => {
  if (!config.demoMode) throw new AppError("NOT_FOUND", "Not available.");
  if (!config.telephonyEnabled)
    throw new AppError("TELEPHONY_DISABLED", "Phone calls are not configured. Use the simulated call.");

  const patient = await getPatientOrThrow();
  const { time } = timeBodySchema.parse(await req.json());

  const { groups } = await getToday(patient);
  const group = groups.find((g) => g.time === time);
  if (!group) throw new AppError("VALIDATION", "No medicines scheduled at that time today.");

  const result = await placeGroupReminder({
    patient,
    doseEventIds: group.doseEventIds,
    scheduledAtUtc: new Date(group.scheduledAtUtc),
    mode: "twilio",
  });
  return NextResponse.json({ reminderCallId: result.reminderCallId, placed: result.placed });
});
