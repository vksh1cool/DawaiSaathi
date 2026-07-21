import { NextResponse } from "next/server";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getSupabaseUserId } from "@/lib/supabase/server";
import { listHouseholdMembers, listPendingInvitations } from "@/lib/supabase/household";

export const runtime = "nodejs";

/**
 * GET /api/household/members. The roster is visible to every household
 * member (RLS/RPC already scope this to the caller's active household);
 * pending invitations are owner-only, so non-owners simply get an empty
 * list rather than a permission error.
 */
export const GET = withErrorBoundary(async () => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "The household roster is not enabled on this deployment.");
  }
  const userId = await getSupabaseUserId();
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "Sign in to view the household roster.");
  }

  const members = await listHouseholdMembers();
  const isOwner = members.some((member) => member.userId === userId && member.role === "owner");
  const invitations = isOwner ? await listPendingInvitations() : [];

  return NextResponse.json({ members, invitations, currentUserId: userId, isOwner });
});
