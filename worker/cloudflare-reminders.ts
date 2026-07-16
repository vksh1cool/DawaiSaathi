/**
 * Cloudflare Cron Trigger → private service-binding call into the Next app.
 * The application owns the reminder logic; this tiny Worker owns scheduling
 * so the OpenNext entrypoint never needs a custom generated handler.
 */
export default {
  async scheduled(_event, env, _ctx): Promise<void> {
    const secrets = env as ReminderWorkerEnv & { REMINDER_CRON_TOKEN: string };
    const response = await env.DAWAISAATHI_APP.fetch(
      "https://dawaisaathi.internal/api/internal/reminders/run",
      {
        method: "POST",
        headers: {
          "x-dawaisaathi-cron-token": secrets.REMINDER_CRON_TOKEN,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Reminder dispatch failed with HTTP ${response.status}.`);
    }
  },
} satisfies ExportedHandler<ReminderWorkerEnv>;
