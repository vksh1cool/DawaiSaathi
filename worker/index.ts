import "dotenv/config";
import { config } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { materializeDoseEvents } from "../src/lib/schedule";
import { sweepStuckCalls } from "../src/lib/calls";
import { processDueReminders } from "./reminders";
import { legacyTenantDataBlocked } from "../src/lib/cloudflare-runtime";

/**
 * Single-instance worker (Arch §12). One tick must never kill the loop.
 *   npm run worker
 */
let running = false;
const legacyDataBlocked = legacyTenantDataBlocked();

async function tick() {
  if (legacyDataBlocked) return;
  if (running) return; // avoid overlap on a slow tick
  running = true;
  try {
    await materializeDoseEvents();
    await processDueReminders();
    await sweepStuckCalls();
  } catch (err) {
    logger.error({ err }, "worker tick error");
  } finally {
    running = false;
  }
}

logger.info(
  { tickSeconds: config.workerTickSeconds, telephony: config.telephonyEnabled, legacyDataBlocked },
  "DawaiSaathi worker started",
);
if (legacyDataBlocked) {
  logger.warn("legacy D1 reminder worker disabled while Supabase tenant runtime is pending");
}

tick();
setInterval(tick, config.workerTickSeconds * 1000);

// Keep the process alive and shut down cleanly.
process.on("SIGINT", () => {
  logger.info("worker stopping");
  process.exit(0);
});
