import twilio from "twilio";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Twilio client + call placement + webhook signature validation (Arch §10). */

let _client: ReturnType<typeof twilio> | null = null;
function client() {
  if (!config.telephonyEnabled) {
    throw new AppError("TELEPHONY_DISABLED", "Telephony is not configured.");
  }
  if (!_client) _client = twilio(config.twilioAccountSid!, config.twilioAuthToken!);
  return _client;
}

/** Place an outbound reminder call; returns the Twilio CallSid (Arch §10.1). */
export async function placeCall(to: string, callId: string): Promise<string> {
  const base = config.publicBaseUrl!;
  try {
    const call = await client().calls.create({
      to,
      from: config.twilioFromNumber!,
      url: `${base}/api/twilio/voice/reminder?callId=${callId}`,
      statusCallback: `${base}/api/twilio/status?callId=${callId}`,
      statusCallbackEvent: ["completed"],
      timeout: 25,
    });
    return call.sid;
  } catch (err) {
    logger.error({ err }, "twilio call create failed");
    throw new AppError("UPSTREAM_TWILIO", "Could not place the call.", err);
  }
}

/** Validate an inbound Twilio webhook signature against the exact public URL (Arch §10.2). */
export function validateSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!config.twilioAuthToken) return false;
  if (!signature) return false;
  return twilio.validateRequest(config.twilioAuthToken, signature, url, params);
}

/**
 * Read + validate a Twilio webhook. The signature is computed against the
 * public (ngrok) URL, not localhost, so we reconstruct it from PUBLIC_BASE_URL.
 */
export async function readWebhook(
  req: Request,
): Promise<{ params: Record<string, string>; valid: boolean; url: string }> {
  const u = new URL(req.url);
  const url = `${config.publicBaseUrl ?? ""}${u.pathname}${u.search}`;
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);
  const valid = validateSignature(req.headers.get("X-Twilio-Signature"), url, params);
  return { params, valid, url };
}

/** Build the public audio URL Twilio should fetch. */
export function audioUrl(file: string): string {
  return `${config.publicBaseUrl ?? ""}/api/audio/${file}`;
}

export { twilio };
