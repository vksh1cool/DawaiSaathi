import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getActiveSchedules, saveSchedules } from "@/lib/schedule";
import { postSchedulesSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** GET /api/schedules — active schedules with medication summary (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  return NextResponse.json({ schedules: await getActiveSchedules(patient.id, patient.timezone) });
});

/** POST /api/schedules — bulk upsert + materialize (Arch §7.5). */
export const POST = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const body = postSchedulesSchema.parse(await req.json());
  await saveSchedules(
    patient.id,
    patient.timezone,
    body.schedules,
    body.weeklyOverridePatientName,
  );
  return NextResponse.json(
    { schedules: await getActiveSchedules(patient.id, patient.timezone) },
    { status: 201 },
  );
});
