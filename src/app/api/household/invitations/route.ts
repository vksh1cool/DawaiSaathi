import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  contact: z.string().trim().min(3).max(254),
  role: z.enum(["caregiver", "viewer"]),
});

/**
 * Creates a single-use invitation for the caller's active household. The raw
 * token is returned exactly once in this response; only its SHA-256 hash is
 * ever persisted (inside the create_household_invitation RPC), and the token
 * must never be logged or stored anywhere else in plaintext.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver invitations are not enabled on this deployment.");
  }
  if (!(await getSupabaseUserId())) {
    throw new AppError("UNAUTHORIZED", "Sign in before inviting a caregiver.");
  }

  const { contact, role } = bodySchema.parse(await request.json());
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_household_invitation", {
    invitee_contact_input: contact,
    role_input: role,
  });
  if (error) {
    logger.warn({ code: error.code }, "Supabase invitation creation failed");
    if (error.code === "42501") {
      throw new AppError("UNAUTHORIZED", "Only the signed-in household owner can invite a caregiver.");
    }
    throw new AppError("VALIDATION", "We could not create that invitation. Please check the contact and try again.");
  }

  const invitation = Array.isArray(data) ? data[0] : data;
  if (!invitation) {
    throw new AppError("INTERNAL", "We could not create that invitation. Please try again.");
  }

  return NextResponse.json(
    {
      invitationId: invitation.invitation_id,
      inviteToken: invitation.invite_token,
      expiresAt: invitation.expires_at,
    },
    { status: 201 },
  );
});
