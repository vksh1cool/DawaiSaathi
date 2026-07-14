import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getToday } from "@/lib/dose-events";

export const runtime = "nodejs";

/** GET /api/today — today's dose groups (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  return NextResponse.json(await getToday(patient));
});
