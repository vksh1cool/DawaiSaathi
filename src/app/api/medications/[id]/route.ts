import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import {
  canonicalizeSalts,
  displayGenericForSalts,
  medicationSafety,
  serializeMedication,
} from "@/lib/medications";
import { archiveSupabaseMedication, updateSupabaseMedication } from "@/lib/supabase/medications";
import { patchMedicationSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/medications/:id — edit fields (Arch §7.2). */
export const PATCH = withErrorBoundary(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (usesSupabaseAuth()) {
    const body = patchMedicationSchema.parse(await req.json());
    const medication = await updateSupabaseMedication(id, body);
    return NextResponse.json({ medication });
  }

  const patient = await getPatientOrThrow();
  const body = patchMedicationSchema.parse(await req.json());

  const existing = await prisma.medication.findFirst({ where: { id, patientId: patient.id } });
  if (!existing) throw new AppError("NOT_FOUND", "Medicine not found.");

  const salts = body.salts ? canonicalizeSalts(body.salts) : undefined;
  const safety = salts ? medicationSafety(salts) : undefined;

  const data: Record<string, unknown> = {};
  if (body.brandName !== undefined) data.brandName = body.brandName;
  data.displayGeneric = salts ? displayGenericForSalts(salts) : body.displayGeneric;
  if (salts) data.saltsJson = JSON.stringify(salts);
  if (body.form !== undefined) data.form = body.form;
  if (body.packSize !== undefined) data.packSize = body.packSize;
  if (body.mrpInr !== undefined) data.mrpInr = body.mrpInr;
  if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate;
  if (body.batchNumber !== undefined) data.batchNumber = body.batchNumber;
  if (body.manufacturer !== undefined) data.manufacturer = body.manufacturer;
  if (body.notes !== undefined) data.notes = body.notes;
  if (safety) {
    if (safety.highRisk !== undefined) data.highRisk = safety.highRisk;
    if (safety.highRiskReason !== undefined) data.highRiskReason = safety.highRiskReason;
  }

  const updated = await prisma.medication.update({
    where: { id },
    data,
  });
  return NextResponse.json({ medication: serializeMedication(updated) });
});

/** DELETE /api/medications/:id — archive + deactivate schedules (Arch §7.2). */
export const DELETE = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (usesSupabaseAuth()) {
    await archiveSupabaseMedication(id);
    return NextResponse.json({ ok: true });
  }

  const patient = await getPatientOrThrow();
  const existing = await prisma.medication.findFirst({ where: { id, patientId: patient.id } });
  if (!existing) throw new AppError("NOT_FOUND", "Medicine not found.");

  await prisma.$transaction([
    prisma.medication.update({ where: { id }, data: { status: "archived" } }),
    prisma.schedule.updateMany({ where: { medicationId: id }, data: { active: false } }),
    // Keep history intact but prevent a removed medicine from being called in
    // the future. `skipped` is excluded from adherence by design.
    prisma.doseEvent.updateMany({
      where: { medicationId: id, status: "scheduled", scheduledAtUtc: { gte: new Date() } },
      data: { status: "skipped", nextAttemptAtUtc: null },
    }),
  ]);
  return NextResponse.json({ ok: true });
});
