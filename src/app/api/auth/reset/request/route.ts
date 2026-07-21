import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resetRequestSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

/**
 * Starts a password reset. This always responds ok:true — revealing whether
 * an email is registered is an account-enumeration risk, and Supabase itself
 * does not surface that distinction from resetPasswordForEmail.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver sign-in is not enabled on this deployment.");
  }

  const { email, next } = resetRequestSchema.parse(await request.json());
  const safeNext = safeInternalPath(next, "/auth/reset");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL(`/auth/callback?next=${encodeURIComponent(safeNext)}`, request.url).toString(),
  });
  if (error) {
    throw new AppError("VALIDATION", "We could not send that reset link. Please try again.");
  }

  return NextResponse.json({ ok: true });
});
