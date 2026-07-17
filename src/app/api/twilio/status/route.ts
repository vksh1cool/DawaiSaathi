import { prisma } from "@/lib/db";
import { readWebhook } from "@/lib/twilio";
import { finalizeUnconfirmed } from "@/lib/calls";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** POST /api/twilio/status — call finished; retry-or-miss if unconfirmed (Arch §10.5). */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });
  if (legacyTenantDataBlocked()) return new Response(null, { status: 204 });

  const callId = new URL(req.url).searchParams.get("callId")!;
  const callStatus = params.CallStatus ?? "";

  const call = await prisma.reminderCall.findUnique({ where: { id: callId } });
  if (!call) return new Response(null, { status: 204 });

  await prisma.reminderCall.update({ where: { id: callId }, data: { twilioStatus: callStatus } });
  logger.info({ callId, callStatus }, "twilio status");

  if (call.outcome !== "confirmed") {
    const notAnswered = ["busy", "no-answer", "failed", "canceled"].includes(callStatus);
    await finalizeUnconfirmed(callId, notAnswered ? "not_answered" : "no_input");
  }
  return new Response(null, { status: 204 });
}
