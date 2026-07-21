import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getHousehold } from "@/lib/household";
import { withErrorBoundary } from "@/lib/errors";
import { supabaseTenantRuntimeReady, usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getSupabaseUserInfo } from "@/lib/supabase/server";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { getSupabasePublicConfig } from "@/lib/supabase/runtime";

export const runtime = "nodejs";

/** GET /api/app-info — client bootstrap flags. */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    const user = await getSupabaseUserInfo();
    const household = user ? await getSupabaseHousehold() : null;
    // Safe for the browser: this is the publishable anon key, never the
    // service-role credential, and Postgres RLS is what actually scopes
    // access — see src/lib/supabase/client.ts.
    const publicConfig = getSupabasePublicConfig();
    return NextResponse.json({
      demoMode: false,
      telephonyEnabled: config.telephonyEnabled,
      hasHousehold: !!household,
      authMode: "supabase",
      signedIn: !!user,
      tenantRuntimeReady: supabaseTenantRuntimeReady(),
      isAnonymous: user?.isAnonymous ?? false,
      supabaseUrl: publicConfig?.url,
      supabaseAnonKey: publicConfig?.anonKey,
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
    isAnonymous: false,
  });
});
