import { prisma } from "@/lib/db";
import { readWebhook, audioUrl, twilio, voiceLocale } from "@/lib/twilio";
import { getAudioSet } from "@/lib/calls";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { CallLanguage, TwilioVoiceLocale } from "@/lib/languages";

export const runtime = "nodejs";

/** POST /api/twilio/voice/reminder — play med list + gather menu (Arch §10.3). */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const vr = new twilio.twiml.VoiceResponse();
  // A valid hangup prevents webhook retry churn while preserving the hard
  // boundary between Supabase tenants and the old shared D1 demo records.
  if (legacyTenantDataBlocked()) {
    vr.hangup();
    return xml(vr);
  }

  const callId = new URL(req.url).searchParams.get("callId");
  const call = callId ? await prisma.reminderCall.findUnique({ where: { id: callId } }) : null;

  if (!call) {
    vr.hangup();
    return xml(vr);
  }
  if (call.outcome) {
    vr.hangup();
    return xml(vr);
  }

  const audio = getAudioSet(call);
  const base = config.publicBaseUrl ?? "";
  const gatherUrl = `${base}/api/twilio/voice/gather?callId=${call.id}`;

  // Two 8-second listens are deliberate: elders often need a moment after
  // hearing the medicines. With no keypress, Twilio continues to the second
  // Gather and then plays the graceful no-input close (Arch §10.3/10.4).
  await appendClip(vr, audio.medlist, audio.fallback.medlist, audio.language);
  await appendMenuGather(vr, gatherUrl, audio.menu, audio.fallback.menu, audio.language);
  await appendMenuGather(vr, gatherUrl, audio.menu, audio.fallback.menu, audio.language);
  await appendClip(vr, audio.noinput, audio.fallback.noinput, audio.language);
  vr.hangup();

  logger.info({ callId: call.id, from: params.From ? "***" : undefined }, "reminder twiml served");
  return xml(vr);
}

async function appendMenuGather(
  vr: InstanceType<typeof twilio.twiml.VoiceResponse>,
  action: string,
  menuFile: string | null,
  fallbackText: string,
  language: CallLanguage,
): Promise<void> {
  const gather = vr.gather({ numDigits: 1, timeout: 8, method: "POST", action });
  if (menuFile) gather.play(await audioUrl(menuFile));
  else {
    const locale = requiredVoiceLocale(language);
    gather.say({ language: locale }, fallbackText);
  }
}

async function appendClip(
  vr: InstanceType<typeof twilio.twiml.VoiceResponse>,
  file: string | null,
  fallbackText: string,
  language: CallLanguage,
): Promise<void> {
  if (file) vr.play(await audioUrl(file));
  else {
    const locale = requiredVoiceLocale(language);
    vr.say({ language: locale }, fallbackText);
  }
}

function requiredVoiceLocale(language: CallLanguage): TwilioVoiceLocale {
  const locale = voiceLocale(language);
  // New calls without a Twilio locale are blocked before they are placed.
  // Keep this defensive guard for corrupt or pre-migration call records.
  if (!locale) throw new Error(`No Twilio fallback locale configured for ${language}`);
  return locale;
}

function xml(vr: InstanceType<typeof twilio.twiml.VoiceResponse>) {
  return new Response(vr.toString(), { headers: { "Content-Type": "text/xml" } });
}
