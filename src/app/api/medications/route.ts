import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { draftToCreateData, serializeMedication } from "@/lib/medications";
import { postMedicationsSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** GET /api/medications — active medications (Arch §7.2). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const meds = await prisma.medication.findMany({
    where: { patientId: patient.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ medications: meds.map(serializeMedication) });
});

/** POST /api/medications — persist caregiver-confirmed medicines (Arch §7.2). */
export const POST = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const body = postMedicationsSchema.parse(await req.json());

  const created = await prisma.$transaction(
    body.medications.map((draft) =>
      prisma.medication.create({
        data: draftToCreateData(draft, patient.id, body.scanBatchId),
      }),
    ),
  );

  if (body.scanBatchId) {
    await prisma.scanBatch
      .update({ where: { id: body.scanBatchId }, data: { status: "confirmed" } })
      .catch(() => undefined);
  }

  return NextResponse.json(
    { medications: created.map(serializeMedication) },
    { status: 201 },
  );
});
