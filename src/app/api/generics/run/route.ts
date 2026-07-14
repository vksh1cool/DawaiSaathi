import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { runGenerics } from "@/lib/generics";

export const runtime = "nodejs";

/** POST /api/generics/run (Arch §7.4). */
export const POST = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  return NextResponse.json(await runGenerics(patient.id));
});
