import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getAdherence } from "@/lib/dose-events";

export const runtime = "nodejs";

/** GET /api/adherence?days=7 (Arch §7.5, AC-11.1). */
export const GET = withErrorBoundary(async (req: Request) => {
  const patient = await getPatientOrThrow();
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 7), 1), 31);
  return NextResponse.json(await getAdherence(patient, days));
});
