import type { Patient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { sendReminderSms } from "@/lib/integrations/twilio";
import { isSmsReminderLanguage, type CallLanguage } from "@/lib/languages";

/** Bump when the user-facing SMS consent text materially changes. */
export const SMS_REMINDER_CONSENT_VERSION = "2026-07-17";
export const SMS_REMINDER_BODY_VERSION = "2026-07-17";

/**
 * SMS is intentionally a smaller, reviewed language surface than voice.
 * An unreviewed country/language pack must not receive an English health text
 * by accident; voice and dashboard follow-up remain available instead.
 */
export function smsReminderBody(language: CallLanguage): string | null {
  if (!isSmsReminderLanguage(language)) return null;
  switch (language) {
    case "hi":
      return "DawaiSaathi: कृपया अपनी दवाई की योजना जाँचें। मदद चाहिए तो देखभाल करने वाले, डॉक्टर या फार्मासिस्ट से बात करें। SMS बंद करने के लिए STOP लिखें।";
    case "en":
      return "DawaiSaathi: Please check your medicine plan. If you need help, contact your caregiver, doctor, or pharmacist. Reply STOP to stop SMS.";
    default:
      return null;
  }
}

/** Queue exactly one SMS only after all call attempts ended unconfirmed. */
export async function queueSmsReminderFallback(
  tx: Prisma.TransactionClient,
  patient: Pick<Patient, "id" | "phoneE164" | "language" | "smsReminderConsentAt">,
  reminderCallId: string,
): Promise<string | null> {
  if (!config.smsEnabled || !patient.smsReminderConsentAt) return null;
  if (!smsReminderBody(patient.language as CallLanguage)) return null;

  try {
    const delivery = await tx.smsDelivery.create({
      data: {
        patientId: patient.id,
        reminderCallId,
        toE164: patient.phoneE164,
        bodyVersion: SMS_REMINDER_BODY_VERSION,
      },
      select: { id: true },
    });
    return delivery.id;
  } catch (error) {
    // A duplicate status webhook or sweeper has already queued this final
    // follow-up. Unique reminderCallId makes it an expected idempotent no-op.
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * Claim before calling Twilio. We intentionally do not auto-retry an
 * indeterminate `sending` state: duplicate medical reminder texts are worse
 * than a single lost follow-up, which remains visible in the dashboard.
 */
export async function deliverQueuedSmsReminder(deliveryId: string): Promise<void> {
  const claimed = await prisma.smsDelivery.updateMany({
    where: { id: deliveryId, status: "queued" },
    data: { status: "sending", errorCode: null },
  });
  if (claimed.count !== 1) return;

  const delivery = await prisma.smsDelivery.findUnique({
    where: { id: deliveryId },
    include: { patient: { select: { language: true, smsReminderConsentAt: true } } },
  });
  if (!delivery || !delivery.patient.smsReminderConsentAt) {
    await prisma.smsDelivery.updateMany({
      where: { id: deliveryId, status: "sending" },
      data: { status: "failed", errorCode: "consent_revoked" },
    });
    return;
  }

  const body = smsReminderBody(delivery.patient.language as CallLanguage);
  if (!body) {
    await prisma.smsDelivery.updateMany({
      where: { id: deliveryId, status: "sending" },
      data: { status: "failed", errorCode: "language_not_enabled" },
    });
    return;
  }

  try {
    const sid = await sendReminderSms(delivery.toE164, body, delivery.id);
    await prisma.smsDelivery.updateMany({
      where: { id: deliveryId, status: "sending" },
      data: { status: "sent", twilioMessageSid: sid, errorCode: null },
    });
    logger.info({ deliveryId, sid }, "consented SMS follow-up accepted by Twilio");
  } catch (error) {
    await prisma.smsDelivery.updateMany({
      where: { id: deliveryId, status: "sending" },
      data: { status: "failed", errorCode: outboundErrorCode(error) },
    });
    logger.warn({ err: error, deliveryId }, "consented SMS follow-up failed");
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function outboundErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code.slice(0, 80);
  }
  return "send_failed";
}
