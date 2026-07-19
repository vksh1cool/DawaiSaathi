import { readWebhook, audioUrl, twilio, voiceLocale } from "@/lib/integrations/twilio";
import { handleGatherResult, getAudioSet } from "@/lib/calls";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { withErrorBoundary } from "@/lib/errors";
import { config } from "@/lib/config";
import type { CallLanguage, TwilioVoiceLocale } from "@/lib/languages";

export const runtime = "nodejs";

/** POST /api/twilio/voice/gather — route the keypress (Arch §10.4). */
export const POST = withErrorBoundary(async (req: Request) => {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const vr = new twilio.twiml.VoiceResponse();
  // Return valid TwiML so Twilio does not retry, but never let a Supabase
  // rollout callback mutate the legacy global D1 reminder record.
  if (legacyTenantDataBlocked()) {
    vr.hangup();
    return xml(vr);
  }

  const callId = new URL(req.url).searchParams.get("callId")!;
  const digits = params.Digits ?? "";

  const result = await handleGatherResult(callId, digits);
  if (!result) {
    vr.hangup();
    return xml(vr);
  }
  const audio = getAudioSet(result.call);
  const base = config.publicBaseUrl ?? "";

  if (result.action === "confirmed") {
    await appendClip(vr, audio.thanks, audio.fallback.thanks, audio.language);
    vr.hangup();
  } else if (result.action === "repeat") {
    vr.redirect({ method: "POST" }, `${base}/api/twilio/voice/reminder?callId=${callId}&replay=1`);
  } else {
    // An unexpected key gets one more menu, while a second replay request is
    // treated as no-input. The status callback/sweep owns retry accounting.
    if (digits && digits !== "1" && digits !== "2") {
      const gather = vr.gather({
        numDigits: 1,
        timeout: 8,
        method: "POST",
        action: `${base}/api/twilio/voice/gather?callId=${callId}`,
      });
      if (audio.menu) gather.play(await audioUrl(audio.menu));
      else gather.say({ language: requiredVoiceLocale(audio.language) }, audio.fallback.menu);
    }
    await appendClip(vr, audio.noinput, audio.fallback.noinput, audio.language);
    vr.hangup();
  }
  return xml(vr);
});

async function appendClip(
  vr: InstanceType<typeof twilio.twiml.VoiceResponse>,
  file: string | null,
  fallbackText: string,
  language: CallLanguage,
): Promise<void> {
  if (file) vr.play(await audioUrl(file));
  else vr.say({ language: requiredVoiceLocale(language) }, fallbackText);
}

function requiredVoiceLocale(language: CallLanguage): TwilioVoiceLocale {
  const locale = voiceLocale(language);
  if (!locale) throw new Error(`No Twilio fallback locale configured for ${language}`);
  return locale;
}

function xml(vr: InstanceType<typeof twilio.twiml.VoiceResponse>) {
  return new Response(vr.toString(), { headers: { "Content-Type": "text/xml" } });
}
