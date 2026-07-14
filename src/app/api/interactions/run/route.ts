import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { runInteractions } from "@/lib/interactions";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/interactions/run — three-layer engine (Arch §7.3). */
export const POST = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const result = await runInteractions(patient.id);
  return NextResponse.json(result);
});
