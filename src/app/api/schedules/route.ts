import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getActiveSchedules, saveSchedules } from "@/lib/schedule";
import { getActiveSupabaseSchedules, saveSupabaseSchedules } from "@/lib/supabase/schedules";
import { postSchedulesSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** GET /api/schedules — active schedules with medication summary (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    return NextResponse.json({ schedules: await getActiveSupabaseSchedules() });
  }

  const patient = await getPatientOrThrow();
  return NextResponse.json({ schedules: await getActiveSchedules(patient.id, patient.timezone) });
});

/** POST /api/schedules — bulk upsert + materialize (Arch §7.5). */
export const POST = withErrorBoundary(async (req: Request) => {
  if (usesSupabaseAuth()) {
    const body = postSchedulesSchema.parse(await req.json());
    await saveSupabaseSchedules(body.schedules, body.weeklyOverridePatientName);
    return NextResponse.json(
      { schedules: await getActiveSupabaseSchedules() },
      { status: 201 },
    );
  }

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
