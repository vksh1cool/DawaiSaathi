/**
 * Cloudflare Cron Trigger → private service-binding call into the Next app.
 * The application owns the reminder logic; this tiny Worker owns scheduling
 * so the OpenNext entrypoint never needs a custom generated handler.
 */
export default {
  async scheduled(_event, env, _ctx): Promise<void> {
    const secrets = env as ReminderWorkerEnv & { REMINDER_CRON_TOKEN: string };
    if (!secrets.REMINDER_CRON_TOKEN) {
      throw new Error("REMINDER_CRON_TOKEN is not configured.");
    }
    const response = await env.DAWAISAATHI_APP.fetch(
      "https://dawaisaathi.internal/api/internal/reminders/run",
      {
        method: "POST",
        headers: {
          "x-dawaisaathi-cron-token": secrets.REMINDER_CRON_TOKEN,
        },
      },
    );

    if (response.status === 503 && (await isTenantRuntimePending(response))) {
      return;
    }
    if (!response.ok) {
      throw new Error(`Reminder dispatch failed with HTTP ${response.status}.`);
    }
  },
} satisfies ExportedHandler<ReminderWorkerEnv>;

async function isTenantRuntimePending(response: Response): Promise<boolean> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return false;
  try {
    const body = (await response.json()) as { code?: unknown; error?: { code?: unknown } };
    return body.code === "TENANT_RUNTIME_PENDING" || body.error?.code === "TENANT_RUNTIME_PENDING";
  } catch {
    return false;
  }
}
