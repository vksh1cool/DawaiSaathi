import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/, "Use a valid phone number with country code."),
  token: z.string().trim().regex(/^[0-9A-Za-z]{4,12}$/, "Enter the code you received."),
});

/** Verifies a Supabase Auth SMS OTP and writes only HttpOnly session cookies. */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver sign-in is not enabled on this deployment.");
  }

  const { phone, token } = bodySchema.parse(await request.json());
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  if (error || !data.session) {
    throw new AppError("UNAUTHORIZED", "That code is not valid or has expired. Request a new code and try again.");
  }

  return NextResponse.json({ ok: true });
});
