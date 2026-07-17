import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export const POST = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  return NextResponse.json({ ok: true });
});
