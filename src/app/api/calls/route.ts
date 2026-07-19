import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getAudioSet } from "@/lib/calls";
import { utcToLocalTime, slotKeyForTime } from "@/lib/util/dates";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { listSupabaseReminderCalls } from "@/lib/supabase/calls";

export const runtime = "nodejs";

/** GET /api/calls — reminder call history for the History screen (S8). */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    const calls = await listSupabaseReminderCalls();
    return NextResponse.json({ calls });
  }

  const patient = await getPatientOrThrow();
  const tz = patient.timezone;
  const calls = await prisma.reminderCall.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    calls: calls.map((c) => {
      // getAudioSet already validates legacy/malformed metadata and falls back
      // safely, so this mapping stays deterministic without a second parser.
      const medlist = getAudioSet(c).medlist;
      const medlistUrl = medlist ? `/api/audio/${medlist}` : null;
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
