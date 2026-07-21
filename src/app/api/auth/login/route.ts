import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

/** Verifies a caregiver email + password and writes the Supabase session cookies. */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver sign-in is not enabled on this deployment.");
  }

  const { email, password } = loginSchema.parse(await request.json());
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new AppError("UNAUTHORIZED", "That email or password is not correct.");
  }

  return NextResponse.json({ ok: true });
});
