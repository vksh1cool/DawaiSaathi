import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { suggestSchedules } from "@/lib/schedule";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/schedules/suggest (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  return NextResponse.json({ suggestions: await suggestSchedules(patient.id) });
});
