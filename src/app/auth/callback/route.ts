import { NextRequest, NextResponse } from "next/server";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Exchanges the one-time magic-link code for HttpOnly SSR session cookies. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const safeNext = safeInternalPath(next);
  if (!code) {
    return NextResponse.redirect(new URL("/auth?error=invalid_link", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/auth?error=expired_link", request.url));
  }

  return NextResponse.redirect(new URL(safeNext, request.url));
}
