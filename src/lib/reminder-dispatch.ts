import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { placeGroupReminder } from "@/lib/calls";

/** Find due dose events, group by slot, and place reminder calls. */
export async function processDueReminders(): Promise<void> {
  const now = new Date();
  const due = await prisma.doseEvent.findMany({
    where: {
      status: "scheduled",
      scheduledAtUtc: { lte: now },
      OR: [{ nextAttemptAtUtc: null }, { nextAttemptAtUtc: { lte: now } }],
    },
    include: { patient: true },
  });
  if (due.length === 0) return;

  if (!config.telephonyEnabled) {
    logger.info({ due: due.length }, "due reminders, but telephony disabled — skipping");
    return;
  }

  const groups = new Map<string, { patient: (typeof due)[number]["patient"]; scheduledAtUtc: Date; ids: string[] }>();
  for (const event of due) {
    const key = `${event.patientId}|${event.scheduledAtUtc.toISOString()}`;
    const group = groups.get(key);
    if (group) group.ids.push(event.id);
    else groups.set(key, { patient: event.patient, scheduledAtUtc: event.scheduledAtUtc, ids: [event.id] });
  }

  for (const group of groups.values()) {
    try {
      await placeGroupReminder({
        patient: group.patient,
        doseEventIds: group.ids,
        scheduledAtUtc: group.scheduledAtUtc,
        mode: "twilio",
      });
    } catch (err) {
      logger.error({ err }, "failed to place group reminder");
    }
  }
}
