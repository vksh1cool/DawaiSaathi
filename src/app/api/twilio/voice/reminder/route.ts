import { prisma } from "@/lib/db";
import { readWebhook, audioUrl, twilio } from "@/lib/twilio";
import { getAudioSet } from "@/lib/calls";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** POST /api/twilio/voice/reminder — play med list + gather menu (Arch §10.3). */
export async function POST(req: Request) {
  const { params, valid, url } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });

  const callId = new URL(req.url).searchParams.get("callId");
  const call = callId ? await prisma.reminderCall.findUnique({ where: { id: callId } }) : null;
  const vr = new twilio.twiml.VoiceResponse();

  if (!call) {
    vr.hangup();
    return xml(vr);
  }

  const audio = getAudioSet(call);
  const base = config.publicBaseUrl ?? "";
  const gatherUrl = `${base}/api/twilio/voice/gather?callId=${call.id}`;

  vr.play(audioUrl(audio.medlist));
  const gather = vr.gather({
    numDigits: 1,
    timeout: 8,
    method: "POST",
    action: gatherUrl,
    actionOnEmptyResult: true,
  });
  gather.play(audioUrl(audio.menu));

  logger.info({ callId: call.id, from: params.From ? "***" : undefined }, "reminder twiml served");
  return xml(vr);
}

function xml(vr: InstanceType<typeof twilio.twiml.VoiceResponse>) {
  return new Response(vr.toString(), { headers: { "Content-Type": "text/xml" } });
}
