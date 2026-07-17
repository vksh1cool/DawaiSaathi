import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getToday } from "@/lib/dose-events";
import { getSupabaseToday } from "@/lib/supabase/dose-events";

export const runtime = "nodejs";

/** GET /api/today — today's dose groups (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    return NextResponse.json(await getSupabaseToday());
  }

  const patient = await getPatientOrThrow();
  return NextResponse.json(await getToday(patient));
});
