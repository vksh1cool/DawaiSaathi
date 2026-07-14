import { z } from "zod";

/**
 * Typed, validated environment access (Arch §3).
 * Required-at-boot vars crash loudly; Twilio vars only warn (telephony optional).
 */

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v.toLowerCase() === "true"));

const int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().positive());

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-5.6"),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE_FEMALE: z.string().default("coral"),
  OPENAI_TTS_VOICE_MALE: z.string().default("onyx"),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),

  DATABASE_URL: z.string().default("file:./dev.db"),
  OPENFDA_API_KEY: z.string().optional(),

  DEFAULT_TZ: z.string().default("Asia/Kolkata"),
  DEMO_MODE: bool(false),
  WORKER_TICK_SECONDS: int(60),
  RETRY_DELAY_MINUTES: int(10),
  MAX_CALL_ATTEMPTS: int(3),

  DEMO_PATIENT_PHONE: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  // Fail fast and loud on missing required config.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

const twilioReady =
  !!env.TWILIO_ACCOUNT_SID &&
  !!env.TWILIO_AUTH_TOKEN &&
  !!env.TWILIO_FROM_NUMBER &&
  !!env.PUBLIC_BASE_URL &&
  !env.TWILIO_ACCOUNT_SID.includes("REPLACE");

if (!twilioReady && typeof window === "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[config] Telephony disabled — Twilio env not fully set. Simulated calls still work.",
  );
}

export const config = {
  openaiApiKey: env.OPENAI_API_KEY,
  openaiModel: env.OPENAI_MODEL,
  ttsModel: env.OPENAI_TTS_MODEL,
  ttsVoiceFemale: env.OPENAI_TTS_VOICE_FEMALE,
  ttsVoiceMale: env.OPENAI_TTS_VOICE_MALE,

  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: env.TWILIO_FROM_NUMBER,
  publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, ""),
  telephonyEnabled: twilioReady,

  databaseUrl: env.DATABASE_URL,
  openfdaApiKey: env.OPENFDA_API_KEY,

  defaultTz: env.DEFAULT_TZ,
  demoMode: env.DEMO_MODE,
  workerTickSeconds: env.WORKER_TICK_SECONDS,
  retryDelayMinutes: env.RETRY_DELAY_MINUTES,
  maxCallAttempts: env.MAX_CALL_ATTEMPTS,

  demoPatientPhone: env.DEMO_PATIENT_PHONE,
} as const;

export type AppConfig = typeof config;
