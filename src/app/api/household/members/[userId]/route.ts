import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ userId: string }> };

/** DELETE /api/household/members/:userId — removes a caregiver/viewer from the household. */
export const DELETE = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Household member management is not enabled on this deployment.");
  }
  if (!(await getSupabaseUserId())) {
    throw new AppError("UNAUTHORIZED", "Sign in before managing household members.");
  }

  const { userId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_household_member", {
    target_user_id: userId,
  });
  if (error) {
    logger.warn({ code: error.code }, "Supabase member removal failed");
    if (error.code === "42501") {
      throw new AppError("UNAUTHORIZED", "Only the household owner can remove a member.");
    }
    if (error.code === "P0002") {
      throw new AppError("NOT_FOUND", "That household member was not found.");
    }
    throw new AppError("VALIDATION", "That member could not be removed.");
  }

  return NextResponse.json({ ok: true });
});
