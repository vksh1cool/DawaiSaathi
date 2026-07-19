import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { runGenerics } from "@/lib/generics";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";

export const runtime = "nodejs";

/** POST /api/generics/run (Arch §7.4). */
export const POST = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) return NextResponse.json(await runGenerics(""));
  const patient = await getPatientOrThrow();
  return NextResponse.json(await runGenerics(patient.id));
});
