import { prisma } from "@/lib/db";
import { readWebhook, audioUrl, twilio } from "@/lib/twilio";
import { handleGatherResult, getAudioSet } from "@/lib/calls";
import { config } from "@/lib/config";

export const runtime = "nodejs";

/** POST /api/twilio/voice/gather — route the keypress (Arch §10.4). */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId")!;
  const digits = params.Digits ?? "";
  const vr = new twilio.twiml.VoiceResponse();

  const result = await handleGatherResult(callId, digits);
  if (!result) {
    vr.hangup();
    return xml(vr);
  }
  const audio = getAudioSet(result.call);
  const base = config.publicBaseUrl ?? "";

  if (result.action === "confirmed") {
    vr.play(audioUrl(audio.thanks));
    vr.hangup();
  } else if (result.action === "repeat") {
    vr.redirect({ method: "POST" }, `${base}/api/twilio/voice/reminder?callId=${callId}&replay=1`);
  } else {
    // no input / invalid → say goodbye; status callback will retry-or-miss.
    vr.play(audioUrl(audio.noinput));
    vr.hangup();
  }
  return xml(vr);
}

function xml(vr: InstanceType<typeof twilio.twiml.VoiceResponse>) {
  return new Response(vr.toString(), { headers: { "Content-Type": "text/xml" } });
}
