import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getGenerics } from "@/lib/generics";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";

export const runtime = "nodejs";

/** GET /api/generics (Arch §7.4). */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) return NextResponse.json(await getGenerics(""));
  const patient = await getPatientOrThrow();
  return NextResponse.json(await getGenerics(patient.id));
});
