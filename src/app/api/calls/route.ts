import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getAudioSet } from "@/lib/calls";
import { utcToLocalTime, slotKeyForTime } from "@/lib/util/dates";

export const runtime = "nodejs";

/** GET /api/calls — reminder call history for the History screen (S8). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const tz = patient.timezone;
  const calls = await prisma.reminderCall.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    calls: calls.map((c) => {
      let medlistUrl: string | null = null;
      try {
        medlistUrl = `/api/audio/${getAudioSet(c).medlist}`;
      } catch {
        /* legacy row */
      }
      return {
        id: c.id,
        time: utcToLocalTime(c.scheduledAtUtc, tz),
        slotKey: slotKeyForTime(utcToLocalTime(c.scheduledAtUtc, tz)),
        mode: c.mode,
        attempt: c.attempt,
        twilioStatus: c.twilioStatus,
        outcome: c.outcome,
        digitsPressed: c.digitsPressed,
        doseCount: parseStringArray(c.doseEventIdsJson).length,
        medlistUrl,
        createdAt: c.createdAt.toISOString(),
      };
    }),
  });
});
