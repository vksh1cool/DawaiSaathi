import { z } from "zod";

/**
 * Typed, validated environment access (Arch §3).
 * The LLM can use OpenAI or an OpenAI-compatible NVIDIA NIM endpoint. TTS is
 * intentionally separate: NIM LLM credentials do not imply an audio-speech
 * endpoint, and calls retain a Twilio <Say> fallback when OpenAI TTS is absent.
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

const nonNegativeInt = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : Number.parseInt(v, 10)))
    .pipe(z.number().int().nonnegative());

const schema = z.object({
  AI_PROVIDER: z.enum(["openai", "nim"]).default("openai"),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6"),
  NIM_API_KEY: z.string().trim().optional(),
  NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NIM_MODEL: z.string().trim().optional(),
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE_FEMALE: z.string().default("coral"),
  OPENAI_TTS_VOICE_MALE: z.string().default("onyx"),
  // Hard, local daily request caps. `0` deliberately blocks that API class.
  // They complement (rather than replace) a project budget in OpenAI.
  OPENAI_DAILY_LLM_REQUEST_LIMIT: nonNegativeInt(12),
  OPENAI_DAILY_TTS_GENERATION_LIMIT: nonNegativeInt(12),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  REMINDER_CRON_TOKEN: z.string().trim().optional(),

  // D1/R2 is the isolated Cloudflare preview runtime. The production migration
  // documented in docs/08 moves health records to Supabase Postgres; local
  // development intentionally defaults to SQLite plus ./storage.
  DATABASE_DRIVER: z.enum(["sqlite", "d1"]).default("sqlite"),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  REQUIRE_ACCESS_GATE: bool(false),

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
const isConfiguredSecret = (value: string | undefined) =>
  !!value && !/^(replace|your[-_ ]|<|changeme|example)/i.test(value.trim());

const openAiConfigured = isConfiguredSecret(env.OPENAI_API_KEY);
const nimConfigured = isConfiguredSecret(env.NIM_API_KEY);
const configIssues: string[] = [];
if (env.AI_PROVIDER === "openai" && !openAiConfigured) {
  configIssues.push("OPENAI_API_KEY is required when AI_PROVIDER=openai");
}
if (env.AI_PROVIDER === "nim" && !nimConfigured) {
  configIssues.push("NIM_API_KEY is required when AI_PROVIDER=nim");
}
if (env.AI_PROVIDER === "nim" && !env.NIM_MODEL) {
  configIssues.push("NIM_MODEL is required when AI_PROVIDER=nim");
}
if (configIssues.length > 0) {
  throw new Error(`Invalid environment configuration:\n${configIssues.map((issue) => `  - ${issue}`).join("\n")}`);
}

const llmApiKey = env.AI_PROVIDER === "nim" ? env.NIM_API_KEY! : env.OPENAI_API_KEY!;
const llmBaseUrl = env.AI_PROVIDER === "nim" ? env.NIM_BASE_URL : env.OPENAI_BASE_URL;
const llmModel = env.AI_PROVIDER === "nim" ? env.NIM_MODEL! : env.OPENAI_MODEL;

const twilioReady =
  isConfiguredSecret(env.TWILIO_ACCOUNT_SID) &&
  isConfiguredSecret(env.TWILIO_AUTH_TOKEN) &&
  isConfiguredSecret(env.TWILIO_FROM_NUMBER) &&
  !!env.PUBLIC_BASE_URL &&
  !env.PUBLIC_BASE_URL.includes("replace");

if (!twilioReady && typeof window === "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[config] Telephony disabled — Twilio env not fully set. Simulated calls still work.",
  );
}

export const config = {
  llmProvider: env.AI_PROVIDER,
  llmApiKey,
  llmBaseUrl,
  llmModel,
  /** An optional OpenAI key used only for gpt-4o-mini-tts audio generation. */
  openAiTtsApiKey: openAiConfigured ? env.OPENAI_API_KEY! : null,
  openAiTtsEnabled: openAiConfigured,
  ttsModel: env.OPENAI_TTS_MODEL,
  ttsVoiceFemale: env.OPENAI_TTS_VOICE_FEMALE,
  ttsVoiceMale: env.OPENAI_TTS_VOICE_MALE,
  openAiDailyLlmRequestLimit: env.OPENAI_DAILY_LLM_REQUEST_LIMIT,
  openAiDailyTtsGenerationLimit: env.OPENAI_DAILY_TTS_GENERATION_LIMIT,

  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: env.TWILIO_FROM_NUMBER,
  publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, ""),
  telephonyEnabled: twilioReady,
  reminderCronToken: env.REMINDER_CRON_TOKEN,

  databaseUrl: env.DATABASE_URL,
  databaseDriver: env.DATABASE_DRIVER,
  storageDriver: env.STORAGE_DRIVER,
  requireAccessGate: env.REQUIRE_ACCESS_GATE,
  openfdaApiKey: env.OPENFDA_API_KEY,

  defaultTz: env.DEFAULT_TZ,
  demoMode: env.DEMO_MODE,
  workerTickSeconds: env.WORKER_TICK_SECONDS,
  retryDelayMinutes: env.RETRY_DELAY_MINUTES,
  maxCallAttempts: env.MAX_CALL_ATTEMPTS,

  demoPatientPhone: env.DEMO_PATIENT_PHONE,
} as const;

export type AppConfig = typeof config;
