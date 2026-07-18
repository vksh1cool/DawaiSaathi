import { prisma } from "@/lib/db";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { readWebhook } from "@/lib/integrations/twilio";

export const runtime = "nodejs";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);

/**
 * Twilio forwards inbound opt-outs here. Twilio's Messaging Service still
 * enforces its own STOP list; this keeps our consent record and queued jobs in
 * sync too. It deliberately never replies with protected health information.
 */
export async function POST(req: Request) {
  const { params, valid } = await readWebhook(req);
  if (!valid) return new Response("invalid signature", { status: 403 });
  if (legacyTenantDataBlocked()) return new Response(null, { status: 204 });

  const from = params.From;
  const body = params.Body?.trim().toLocaleUpperCase();
  if (!from || !body || !STOP_WORDS.has(body)) return new Response(null, { status: 204 });

  const matchingPatients = await prisma.patient.findMany({
    where: { phoneE164: from },
    select: { id: true },
  });
  if (matchingPatients.length === 0) return new Response(null, { status: 204 });

  const ids = matchingPatients.map((patient) => patient.id);
  await prisma.$transaction([
    prisma.patient.updateMany({
      where: { id: { in: ids } },
      data: { smsReminderConsentAt: null, smsReminderConsentVersion: null },
    }),
    prisma.smsDelivery.updateMany({
      where: { patientId: { in: ids }, status: "queued" },
      data: { status: "failed", errorCode: "opted_out" },
    }),
  ]);
  logger.info({ patientCount: ids.length }, "SMS consent revoked through Twilio STOP");
  return new Response(null, { status: 204 });
}
