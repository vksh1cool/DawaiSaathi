import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getHousehold } from "@/lib/household";
import { withErrorBoundary } from "@/lib/errors";

export const runtime = "nodejs";

/** GET /api/app-info — client bootstrap flags. */
export const GET = withErrorBoundary(async () => {
  const hh = await getHousehold();
  return NextResponse.json({
    demoMode: config.demoMode,
    telephonyEnabled: config.telephonyEnabled,
    hasHousehold: !!hh,
  });
});
