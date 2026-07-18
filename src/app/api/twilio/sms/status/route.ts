import { prisma } from "@/lib/db";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { readWebhook } from "@/lib/integrations/twilio";

export const runtime = "nodejs";

/** Twilio delivery callback for the one SMS tied to a final reminder call. */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });
  if (legacyTenantDataBlocked()) return new Response(null, { status: 204 });

  const deliveryId = new URL(req.url).searchParams.get("deliveryId");
  if (!deliveryId) return new Response(null, { status: 204 });

  const deliveryStatus = normalizeStatus(params.MessageStatus);
  const messageSid = params.MessageSid || params.SmsSid;
  const errorCode = params.ErrorCode || null;
  const updated = await prisma.smsDelivery.updateMany({
    where: { id: deliveryId },
    data: {
      status: deliveryStatus,
      ...(messageSid ? { twilioMessageSid: messageSid } : {}),
      errorCode: errorCode ? errorCode.slice(0, 80) : null,
    },
  });
  if (updated.count > 0) logger.info({ deliveryId, deliveryStatus }, "Twilio SMS delivery update");
  return new Response(null, { status: 204 });
}

function normalizeStatus(status: string | undefined) {
  if (status === "delivered") return "delivered";
  if (status === "undelivered") return "undelivered";
  if (status === "failed") return "failed";
  return "sent";
}
