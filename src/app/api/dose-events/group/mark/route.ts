import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { markDoseGroupConfirmed } from "@/lib/dose-events";
import { confirmSupabaseDoseGroup } from "@/lib/supabase/dose-events";
import { markDoseGroupSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/dose-events/group/mark — atomically confirm one visible dose slot. */
export const POST = withErrorBoundary(async (req: Request) => {
  if (usesSupabaseAuth()) {
    const { doseEventIds } = markDoseGroupSchema.parse(await req.json());
    const updated = await confirmSupabaseDoseGroup(doseEventIds);
    return NextResponse.json({ doseEvents: updated });
  }

  const patient = await getPatientOrThrow();
  const { doseEventIds } = markDoseGroupSchema.parse(await req.json());
  const updated = await markDoseGroupConfirmed(patient.id, doseEventIds);
  if (!updated) throw new AppError("NOT_FOUND", "One or more doses were not found.");
  return NextResponse.json({ doseEvents: updated.map((event) => ({ id: event.id, status: "confirmed" })) });
});
