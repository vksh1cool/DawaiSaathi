import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { serializeFinding } from "@/lib/interactions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/interactions/:id/acknowledge (Arch §7.3, US-5). */
export const POST = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patient = await getPatientOrThrow();
  const row = await prisma.interactionFinding.findFirst({ where: { id, patientId: patient.id } });
  if (!row) throw new AppError("NOT_FOUND", "Finding not found.");

  const updated = await prisma.interactionFinding.update({
    where: { id },
    data: { acknowledged: true, acknowledgedAt: new Date() },
  });
  const meds = await prisma.medication.findMany({
    where: { patientId: patient.id },
    select: { id: true, brandName: true },
  });
  const brandMap = new Map(meds.map((m) => [m.id, m.brandName]));
  return NextResponse.json({ finding: serializeFinding(updated, brandMap) });
});
