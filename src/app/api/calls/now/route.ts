import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { config } from "@/lib/config";
import { getPatientOrThrow } from "@/lib/household";
import { getToday } from "@/lib/dose-events";
import { placeGroupReminder } from "@/lib/calls";
import { timeBodySchema } from "@/lib/validation";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getSupabaseToday } from "@/lib/supabase/dose-events";
import { placeSupabaseGroupReminder } from "@/lib/supabase/calls";

export const runtime = "nodejs";
export const maxDuration = 30;

/** POST /api/calls/now — trigger a real reminder call immediately (DEMO_MODE, Arch §7.7). */
export const POST = withErrorBoundary(async (req: Request) => {
  if (!config.demoMode) throw new AppError("NOT_FOUND", "Not available.");
  if (!config.telephonyEnabled)
    throw new AppError("TELEPHONY_DISABLED", "Phone calls are not configured. Use the simulated call.");

  const { time } = timeBodySchema.parse(await req.json());

  if (usesSupabaseAuth()) {
    const { groups } = await getSupabaseToday();
    const group = groups.find((g) => g.time === time);
    if (!group || group.status !== "upcoming") {
      throw new AppError("VALIDATION", "No pending medicines are scheduled at that time today.");
    }
    const result = await placeSupabaseGroupReminder({
      doseEventIds: group.doseEventIds,
      scheduledAtUtc: new Date(group.scheduledAtUtc),
      mode: "twilio",
    });
    // `placeSupabaseGroupReminder` restores the events for a retry when
    // Twilio rejects the call. Do not report a successful 200 in that case.
    if (!result.placed) {
      throw new AppError("UPSTREAM_TWILIO", "We couldn't place the call. Please try again.");
    }
    return NextResponse.json({ reminderCallId: result.reminderCallId, placed: result.placed });
  }

  const patient = await getPatientOrThrow();
  const { groups } = await getToday(patient);
  const group = groups.find((g) => g.time === time);
  if (!group || group.status !== "upcoming") {
    throw new AppError("VALIDATION", "No pending medicines are scheduled at that time today.");
  }

  const result = await placeGroupReminder({
    patient,
    doseEventIds: group.doseEventIds,
    scheduledAtUtc: new Date(group.scheduledAtUtc),
    mode: "twilio",
  });
  // `placeGroupReminder` restores the events for a retry when Twilio rejects
  // the call. Do not report a successful 200 to the caregiver in that case.
  if (!result.placed) {
    throw new AppError("UPSTREAM_TWILIO", "We couldn't place the call. Please try again.");
  }
  return NextResponse.json({ reminderCallId: result.reminderCallId, placed: result.placed });
});
