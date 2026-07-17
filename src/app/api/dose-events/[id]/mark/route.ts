import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { markDose } from "@/lib/dose-events";
import { markSupabaseDose } from "@/lib/supabase/dose-events";
import { markDoseSchema } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/dose-events/:id/mark (Arch §7.5). */
export const POST = withErrorBoundary(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (usesSupabaseAuth()) {
    const { status } = markDoseSchema.parse(await req.json());
    const updated = await markSupabaseDose(id, status);
    return NextResponse.json({ doseEvent: updated });
  }

  const patient = await getPatientOrThrow();
  const { status } = markDoseSchema.parse(await req.json());
  const updated = await markDose(patient.id, id, status);
  if (!updated) throw new AppError("NOT_FOUND", "Dose not found.");
  return NextResponse.json({ doseEvent: { id: updated.id, status: updated.status } });
});
