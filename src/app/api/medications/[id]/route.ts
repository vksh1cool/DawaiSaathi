import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { serializeMedication } from "@/lib/medications";
import { patchMedicationSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/medications/:id — edit fields (Arch §7.2). */
export const PATCH = withErrorBoundary(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patient = await getPatientOrThrow();
  const body = patchMedicationSchema.parse(await req.json());

  const existing = await prisma.medication.findFirst({ where: { id, patientId: patient.id } });
  if (!existing) throw new AppError("NOT_FOUND", "Medicine not found.");

  const updated = await prisma.medication.update({
    where: { id },
    data: {
      brandName: body.brandName,
      displayGeneric: body.displayGeneric,
      saltsJson: body.salts ? JSON.stringify(body.salts) : undefined,
      form: body.form,
      packSize: body.packSize,
      mrpInr: body.mrpInr,
      expiryDate: body.expiryDate,
      batchNumber: body.batchNumber,
      manufacturer: body.manufacturer,
      notes: body.notes,
    },
  });
  return NextResponse.json({ medication: serializeMedication(updated) });
});

/** DELETE /api/medications/:id — archive + deactivate schedules (Arch §7.2). */
export const DELETE = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patient = await getPatientOrThrow();
  const existing = await prisma.medication.findFirst({ where: { id, patientId: patient.id } });
  if (!existing) throw new AppError("NOT_FOUND", "Medicine not found.");

  await prisma.$transaction([
    prisma.medication.update({ where: { id }, data: { status: "archived" } }),
    prisma.schedule.updateMany({ where: { medicationId: id }, data: { active: false } }),
  ]);
  return NextResponse.json({ ok: true });
});
