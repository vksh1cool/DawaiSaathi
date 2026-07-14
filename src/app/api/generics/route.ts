import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getGenerics } from "@/lib/generics";

export const runtime = "nodejs";

/** GET /api/generics (Arch §7.4). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  return NextResponse.json(await getGenerics(patient.id));
});
