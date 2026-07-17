import pino from "pino";

/**
 * Structured logger. Phone numbers are redacted to last 4 digits (Arch §14).
 * Use `redactPhone()` before logging any E.164 number.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: undefined,
  redact: {
    paths: ["phoneE164", "toE164", "patient.phoneE164", "to", "from", "*.phoneE164", "*.toE164", "*.to", "*.from"],
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } }
      : undefined,
});

export function redactPhone(phone: string | null | undefined): string {
  if (!phone) return "unknown";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `***${digits.slice(-4)}`;
}
