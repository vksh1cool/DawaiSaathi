import { prisma } from "../src/lib/db";
import { config } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { placeGroupReminder } from "../src/lib/calls";

/** Find due dose events, group by slot, place reminder calls (Arch §12.3). */
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
    // Log-only mode: rely on simulated calls. Never crash (Data-Flow §12).
    logger.info({ due: due.length }, "due reminders, but telephony disabled — skipping");
    return;
  }

  // Group by (patientId, scheduledAtUtc).
  const groups = new Map<string, { patient: (typeof due)[number]["patient"]; scheduledAtUtc: Date; ids: string[] }>();
  for (const e of due) {
    const key = `${e.patientId}|${e.scheduledAtUtc.toISOString()}`;
    const g = groups.get(key);
    if (g) g.ids.push(e.id);
    else groups.set(key, { patient: e.patient, scheduledAtUtc: e.scheduledAtUtc, ids: [e.id] });
  }

  for (const g of groups.values()) {
    try {
      await placeGroupReminder({
        patient: g.patient,
        doseEventIds: g.ids,
        scheduledAtUtc: g.scheduledAtUtc,
        mode: "twilio",
      });
    } catch (err) {
      logger.error({ err }, "failed to place group reminder");
    }
  }
}
