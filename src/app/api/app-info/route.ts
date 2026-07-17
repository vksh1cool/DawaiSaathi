import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getHousehold } from "@/lib/household";
import { withErrorBoundary } from "@/lib/errors";
import { supabaseTenantRuntimeReady, usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold } from "@/lib/supabase/household";

export const runtime = "nodejs";

/** GET /api/app-info — client bootstrap flags. */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    const userId = await getSupabaseUserId();
    const household = userId ? await getSupabaseHousehold() : null;
    return NextResponse.json({
      demoMode: false,
      telephonyEnabled: config.telephonyEnabled,
      hasHousehold: !!household,
      authMode: "supabase",
      signedIn: !!userId,
      tenantRuntimeReady: supabaseTenantRuntimeReady(),
    });
  }

  const hh = await getHousehold();
  return NextResponse.json({
    demoMode: config.demoMode,
    telephonyEnabled: config.telephonyEnabled,
    hasHousehold: !!hh,
    authMode: "access_gate",
    signedIn: true,
    tenantRuntimeReady: false,
  });
});
