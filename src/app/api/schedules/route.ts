import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseStringArray } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { saveSchedules } from "@/lib/schedule";
import { postSchedulesSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** GET /api/schedules — active schedules with medication summary (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const schedules = await prisma.schedule.findMany({
    where: { active: true, medication: { patientId: patient.id, status: "active" } },
    include: { medication: { select: { id: true, brandName: true, displayGeneric: true } } },
  });
  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      medicationId: s.medicationId,
      medication: s.medication,
      times: parseStringArray(s.timesJson),
      foodRelation: s.foodRelation,
      startDate: s.startDate.toISOString(),
      endDate: s.endDate?.toISOString() ?? null,
    })),
  });
});

/** POST /api/schedules — bulk upsert + materialize (Arch §7.5). */
export const POST = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const body = postSchedulesSchema.parse(await req.json());
  await saveSchedules(patient.id, patient.timezone, body.schedules);
  return NextResponse.json({ ok: true }, { status: 201 });
});
