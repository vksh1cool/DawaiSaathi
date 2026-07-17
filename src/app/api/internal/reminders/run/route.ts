import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { sweepStuckCalls } from "@/lib/calls";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { processDueReminders } from "@/lib/reminder-dispatch";
import { materializeDoseEvents } from "@/lib/schedule";
import { secretsMatch } from "@/lib/secret";
import { legacyTenantDataBlocked } from "@/lib/cloudflare-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Called only by the private Cron Worker through a Cloudflare service binding.
 * It is still token-protected so a routing/configuration mistake cannot make
 * someone else's HTTP request advance reminder state.
 */
export const POST = withErrorBoundary(async (req: Request) => {
  const authorized = await secretsMatch(
    req.headers.get("x-dawaisaathi-cron-token"),
    config.reminderCronToken,
  );
  if (!authorized) throw new AppError("UNAUTHORIZED", "Unauthorized.");
  if (legacyTenantDataBlocked()) {
    logger.warn("legacy D1 reminder dispatch blocked while Supabase tenant runtime is pending");
    return NextResponse.json(
      { ok: false, code: "TENANT_RUNTIME_PENDING" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const started = Date.now();
  const materialized = await materializeDoseEvents();
  await processDueReminders();
  await sweepStuckCalls();
  logger.info({ materialized, ms: Date.now() - started }, "cloud reminder dispatch complete");
  return NextResponse.json({ ok: true, materialized });
});
