import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/household/invitations/:id — revokes a pending invitation. */
export const DELETE = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver invitations are not enabled on this deployment.");
  }
  if (!(await getSupabaseUserId())) {
    throw new AppError("UNAUTHORIZED", "Sign in before managing invitations.");
  }

  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_household_invitation", {
    invitation_id_input: id,
  });
  if (error) {
    logger.warn({ code: error.code }, "Supabase invitation revoke failed");
    if (error.code === "42501") {
      throw new AppError("UNAUTHORIZED", "Only the household owner can revoke an invitation.");
    }
    if (error.code === "P0002") {
      throw new AppError("NOT_FOUND", "That invitation was not found.");
    }
    throw new AppError("VALIDATION", "That invitation could not be revoked.");
  }

  return NextResponse.json({ ok: true });
});
