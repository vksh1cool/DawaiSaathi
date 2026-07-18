import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { config } from "@/lib/config";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { safeInternalPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({
  phone: z.string().trim().regex(/^\+[1-9][0-9]{6,14}$/).optional(),
  email: z.string().trim().email().max(254).optional(),
  next: z.string().max(2048).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.phone) === Boolean(value.email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide one phone number or one email address." });
  }
});

/**
 * Starts caregiver authentication. This is intentionally separate from the
 * patient's reminder phone number and never uses the reminder/SMS fallback.
 * Supabase Auth owns delivery/rate limits; configure its SMS provider and
 * CAPTCHA/rate controls before enabling AUTH_DRIVER=supabase publicly.
 */
export const POST = withErrorBoundary(async (request: Request) => {
  if (!usesSupabaseAuth()) {
    throw new AppError("NOT_FOUND", "Caregiver sign-in is not enabled on this deployment.");
  }

  const { phone, email, next } = bodySchema.parse(await request.json());
  if (phone && !config.supabasePhoneAuthEnabled) {
    throw new AppError("VALIDATION", "Phone sign-in is not enabled yet. Use email sign-in for this deployment.");
  }

  const supabase = await createSupabaseServerClient();
  const safeNext = safeInternalPath(next);
  const { error } =
    phone
      ? await supabase.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: true },
        })
      : await supabase.auth.signInWithOtp({
          email: email!,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: new URL("/auth/callback?next=" + encodeURIComponent(safeNext), "https://dawaisaathi.pages.dev").toString(),
          },
        });
  if (error) {
    // Do not reveal whether a phone number already has an account.
    throw new AppError("UNAUTHORIZED", "We could not send a secure sign-in message. Check the contact and try again.");
  }

  return NextResponse.json({ ok: true, delivery: phone ? "sms" : "email" });
});
