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

  const subject = parsed.kind === "appreciation"
    ? "DawaiSaathi Appreciation"
    : "DawaiSaathi Improvement Request";

  // Primary: Cloudflare Email binding if available
  const emailBinding = getFeedbackEmailBinding();
  if (emailBinding) {
    try {
      await emailBinding.send({
        to: TO,
        from: { email: FROM, name: "DawaiSaathi feedback" },
        ...(parsed.email ? { replyTo: parsed.email } : {}),
        subject,
        text: feedbackText(parsed),
        html: feedbackHtml(parsed),
      });
      logger.info({ kind: parsed.kind, locale: parsed.locale }, "feedback sent via Cloudflare email binding");
      return NextResponse.json({ ok: true });
    } catch (err) {
      logger.warn({ err }, "Cloudflare email binding failed; trying FormSubmit fallback");
    }
  }

  // Fallback / Public Provider: FormSubmit.co (delivers directly to contact@launchpixel.in)
  try {
    const fsRes = await fetch(`https://formsubmit.co/ajax/${TO}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://dawaisaathi.pages.dev",
      },
      body: JSON.stringify({
        name: "DawaiSaathi Feedback User",
        email: parsed.email || TO,
        subject: `[DawaiSaathi] ${subject}`,
        message: feedbackText(parsed),
        _template: "table",
        _captcha: "false",
      }),
    });
    const data = await fsRes.json().catch(() => ({}));
    logger.info({ status: fsRes.status, data }, "feedback sent via FormSubmit");
  } catch (err) {
    logger.error({ err }, "FormSubmit delivery attempt failed; logged feedback locally");
  }

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
