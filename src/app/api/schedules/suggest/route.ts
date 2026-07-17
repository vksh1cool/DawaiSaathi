import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { suggestSchedules } from "@/lib/schedule";
import { suggestSupabaseSchedules } from "@/lib/supabase/schedules";

export const runtime = "nodejs";
export const maxDuration = 30;

/** GET /api/schedules/suggest (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    return NextResponse.json({ suggestions: await suggestSupabaseSchedules() });
  }

  const patient = await getPatientOrThrow();
  return NextResponse.json({ suggestions: await suggestSchedules(patient.id) });
});
