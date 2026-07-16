import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { markDoseGroupConfirmed } from "@/lib/dose-events";
import { markDoseGroupSchema } from "@/lib/validation";

export const runtime = "nodejs";

/** POST /api/dose-events/group/mark — atomically confirm one visible dose slot. */
export const POST = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const { doseEventIds } = markDoseGroupSchema.parse(await req.json());
  const updated = await markDoseGroupConfirmed(patient.id, doseEventIds);
  if (!updated) throw new AppError("NOT_FOUND", "One or more doses were not found.");
  return NextResponse.json({ doseEvents: updated.map((event) => ({ id: event.id, status: "confirmed" })) });
});
