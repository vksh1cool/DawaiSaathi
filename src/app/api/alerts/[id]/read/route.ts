import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { prisma } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { markSupabaseAlertRead } from "@/lib/supabase/alerts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/alerts/:id/read (Arch §7.6). */
export const POST = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (usesSupabaseAuth()) {
    await markSupabaseAlertRead(id);
    return NextResponse.json({ ok: true });
  }

  const patient = await getPatientOrThrow();
  await prisma.caregiverAlert.updateMany({
    where: { id, patientId: patient.id },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
});
