import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { markDose } from "@/lib/dose-events";
import { markDoseSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/dose-events/:id/mark (Arch §7.5). */
export const POST = withErrorBoundary(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patient = await getPatientOrThrow();
  const { status } = markDoseSchema.parse(await req.json());
  const updated = await markDose(patient.id, id, status);
  if (!updated) throw new AppError("NOT_FOUND", "Dose not found.");
  return NextResponse.json({ doseEvent: { id: updated.id, status: updated.status } });
});
