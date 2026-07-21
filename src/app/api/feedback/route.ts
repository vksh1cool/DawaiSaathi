import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { APP_LANGUAGE_CODES } from "@/lib/languages";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const feedbackSchema = z.object({
  kind: z.enum(["improvement", "appreciation"]),
  message: z.string().trim().min(3, "Feedback message is required").max(1200),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  locale: z.enum(APP_LANGUAGE_CODES).default("en"),
  // Basic bot trap. Stronger public-launch protection is Turnstile, which is
  // intentionally a rollout prerequisite rather than a fake client-only check.
  website: z.string().max(0).optional(),
  openedAt: z.number().int().positive(),
});

const TO = "contact@launchpixel.in";
const FROM = "feedback@launchpixel.in";

export const POST = withErrorBoundary(async (request: Request) => {
  const parsed = feedbackSchema.parse(await request.json());
  if (Date.now() - parsed.openedAt < 700) {
    throw new AppError("VALIDATION", "Please take a moment before sending feedback.");
  }

  const email = getFeedbackEmailBinding();
  if (!email) {
    logger.info(
      { kind: parsed.kind, locale: parsed.locale, hasReplyEmail: !!parsed.email, message: parsed.message },
      "Feedback stored via fallback (email binding unconfigured)",
    );
    return NextResponse.json({ ok: true });
  }

  const subject = parsed.kind === "appreciation"
    ? "DawaiSaathi appreciation"
    : "DawaiSaathi improvement request";
  try {
    await email.send({
      to: TO,
      from: { email: FROM, name: "DawaiSaathi feedback" },
      ...(parsed.email ? { replyTo: parsed.email } : {}),
      subject,
      text: feedbackText(parsed),
      html: feedbackHtml(parsed),
    });
  } catch (err) {
    logger.error({ err, kind: parsed.kind, locale: parsed.locale }, "Feedback email send failed; logged to server output");
  }

  logger.info({ kind: parsed.kind, locale: parsed.locale, hasReplyEmail: !!parsed.email }, "feedback received");
  return NextResponse.json({ ok: true });
});

function getFeedbackEmailBinding() {
  try {
    return getCloudflareContext().env.EMAIL;
  } catch {
    return null;
  }
}

function feedbackText(input: z.infer<typeof feedbackSchema>) {
  const label = input.kind === "appreciation" ? "What they liked and why" : "Improvement or feature request";
  return `DawaiSaathi ${label}\n\n${input.message}\n\nLocale: ${input.locale}\nReply email: ${input.email || "Not provided"}`;
}

function feedbackHtml(input: z.infer<typeof feedbackSchema>) {
  const label = input.kind === "appreciation" ? "What they liked and why" : "Improvement or feature request";
  return `<h1>${escapeHtml(label)}</h1><p>${escapeHtml(input.message).replace(/\n/g, "<br>")}</p><hr><p>Locale: ${escapeHtml(input.locale)}<br>Reply email: ${escapeHtml(input.email || "Not provided")}</p>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
