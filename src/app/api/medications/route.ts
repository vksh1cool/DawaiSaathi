import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
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

  const created = await prisma.$transaction(async (tx) => {
    // A double tap, reconnect retry, or two open review tabs must not create
    // the same medicines twice. Claiming the extracted batch inside this
    // transaction makes confirmation a one-time operation.
    if (body.scanBatchId) {
      const claimed = await tx.scanBatch.updateMany({
        where: { id: body.scanBatchId, patientId: patient.id, status: "extracted" },
        data: { status: "confirming" },
      });
      if (claimed.count === 0) {
        throw new AppError("VALIDATION", "This scan is no longer available to confirm.");
      }
    }

    const medicines = await Promise.all(
      body.medications.map((draft) =>
        tx.medication.create({
          data: draftToCreateData(draft, patient.id, body.scanBatchId),
        }),
      ),
    );

    if (body.scanBatchId) {
      await tx.scanBatch.update({
        where: { id: body.scanBatchId },
        data: { status: "confirmed" },
      });
    }
    return medicines;
  });

  return NextResponse.json(
    { medications: created.map(serializeMedication) },
    { status: 201 },
  );
});
