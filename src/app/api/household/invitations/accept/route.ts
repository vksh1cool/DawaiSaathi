import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/, "This invitation link is invalid."),
});

/**
 * Accepts a verified email- or phone-bound, single-use invitation. The token
 * is never logged; Postgres hashes and verifies it inside the SECURITY DEFINER
 * RPC.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver invitations are not enabled on this deployment.");
  }
  if (!(await getSupabaseUserId())) {
    throw new AppError("UNAUTHORIZED", "Sign in before accepting this invitation.");
  }

  const { token } = bodySchema.parse(await request.json());
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("accept_household_invitation", {
    invite_token_input: token,
  });
  if (error) {
    logger.warn({ code: error.code }, "Supabase invitation acceptance failed");
    if (error.code === "42501") {
      throw new AppError("UNAUTHORIZED", "Use the caregiver account for the email address or phone number that received this invitation.");
    }
    throw new AppError("VALIDATION", "This invitation has expired, was already used, or is not valid.");
  }

  return NextResponse.json({ ok: true });
});
