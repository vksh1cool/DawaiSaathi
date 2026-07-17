import { NextResponse } from "next/server";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getAdherence } from "@/lib/dose-events";
import { getSupabaseAdherence } from "@/lib/supabase/dose-events";

export const runtime = "nodejs";

/** GET /api/adherence?days=7 (Arch §7.5, AC-11.1). */
export const GET = withErrorBoundary(async (req: Request) => {
  const requested = Number(new URL(req.url).searchParams.get("days") ?? 7);
  const days = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 31) : 7;
  if (usesSupabaseAuth()) {
    return NextResponse.json(await getSupabaseAdherence(days));
  }

  const patient = await getPatientOrThrow();
  return NextResponse.json(await getAdherence(patient, days));
});
