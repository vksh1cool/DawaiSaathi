import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

/**
 * Creates a caregiver account with an email + password. Supabase Auth owns
 * confirmation delivery and rate limits; when email confirmations are
 * required the response carries no session and the client should show
 * "check your email" rather than navigating in.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver sign-in is not enabled on this deployment.");
  }

  const { email, password, next } = signUpSchema.parse(await request.json());
  const safeNext = safeInternalPath(next);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: new URL(`/auth/callback?next=${encodeURIComponent(safeNext)}`, request.url).toString(),
    },
  });
  if (error) {
    throw new AppError("VALIDATION", "We could not create your account. Please try again.");
  }
  // Supabase's documented signal for "this email is already a confirmed
  // user": signUp does not error (to avoid account enumeration) but returns
  // an empty identities array instead of creating a new one.
  if (data.user && data.user.identities && data.user.identities.length === 0) {
    throw new AppError("CONFLICT", "An account with that email already exists. Try signing in instead.");
  }

  return NextResponse.json({ ok: true, confirmationRequired: !data.session });
});
