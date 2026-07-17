import twilio from "twilio";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { twilioVoiceLocale, type CallLanguage, type TwilioVoiceLocale } from "@/lib/languages";
import { accessGateEnabled, createAudioAccessToken } from "@/lib/access-gate";

/** Twilio client + call placement + webhook signature validation (Arch §10). */

let _client: ReturnType<typeof twilio> | null = null;
function client() {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new AppError("TELEPHONY_DISABLED", "Twilio is not configured.");
  }
  if (!_client) _client = twilio(config.twilioAccountSid!, config.twilioAuthToken!);
  return _client;
}

/** Place an outbound reminder call; returns the Twilio CallSid (Arch §10.1). */
export async function placeCall(to: string, callId: string): Promise<string> {
  if (!config.telephonyEnabled) {
    throw new AppError("TELEPHONY_DISABLED", "Telephony is not configured.");
  }
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

/**
 * Send an explicitly consented, low-information follow-up. The SMS body never
 * contains medicine names, dose instructions, diagnoses, or OTPs.
 */
export async function sendReminderSms(to: string, body: string, deliveryId: string): Promise<string> {
  if (!config.smsEnabled) throw new AppError("TELEPHONY_DISABLED", "SMS is not configured.");
  const statusCallback = `${config.publicBaseUrl}/api/twilio/sms/status?deliveryId=${encodeURIComponent(deliveryId)}`;
  try {
    const message = await client().messages.create({
      to,
      body,
      statusCallback,
      ...(config.twilioMessagingServiceSid
        ? { messagingServiceSid: config.twilioMessagingServiceSid }
        : { from: config.twilioFromNumber! }),
    });
    return message.sid;
  } catch (err) {
    logger.error({ err, deliveryId }, "twilio SMS create failed");
    throw new AppError("UPSTREAM_TWILIO", "Could not send the SMS follow-up.", err);
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

/** Build a short-lived, file-bound audio URL Twilio can fetch without a browser cookie. */
export async function audioUrl(file: string): Promise<string> {
  const base = `${config.publicBaseUrl ?? ""}/api/audio/${file}`;
  if (!accessGateEnabled()) return base;
  const token = await createAudioAccessToken(file);
  return `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * Locale passed to Twilio <Say>. `null` means the language can only be played
 * from generated audio; callers must not silently fall back to another spoken
 * language for a medicine reminder.
 */
export function voiceLocale(language: CallLanguage): TwilioVoiceLocale | null {
  return twilioVoiceLocale(language);
}

export { twilio };
