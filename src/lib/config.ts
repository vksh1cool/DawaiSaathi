import { z } from "zod";

/**
 * Typed, validated environment access (Arch §3).
 * The LLM can use OpenAI, an OpenAI-compatible NVIDIA NIM endpoint, or Groq.
 * Groq uses two models: a large text model for reasoning tasks and a vision
 * model (Llama-4-Scout) for strip scanning. TTS is intentionally separate:
 * NIM/Groq credentials do not imply an audio-speech endpoint, and calls
 * retain a Twilio <Say> fallback when OpenAI TTS is absent.
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
  AI_PROVIDER: z.enum(["openai", "nim", "groq", "gemini"]).optional(),
  OPENAI_API_KEY: z.string().trim().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().default("gpt-5.6"),
  NIM_API_KEY: z.string().trim().optional(),
  NIM_BASE_URL: z.string().url().default("https://integrate.api.nvidia.com/v1"),
  NIM_MODEL: z.string().trim().optional(),
  GROQ_API_KEY: z.string().trim().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  GROQ_VISION_MODEL: z.string().default("meta-llama/llama-4-scout-17b-16e-instruct"),
  // OpenAI TTS: optional paid last resort behind Gemini. Only used when an
  // OpenAI key is configured and Gemini is unavailable.
  OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
  OPENAI_TTS_VOICE_FEMALE: z.string().default("coral"),
  OPENAI_TTS_VOICE_MALE: z.string().default("onyx"),
  OPENAI_DAILY_LLM_REQUEST_LIMIT: nonNegativeInt(12),
  OPENAI_DAILY_TTS_GENERATION_LIMIT: nonNegativeInt(12),

  // Hugging Face TTS (free open source SOTA voice models via Inference API)
  HUGGINGFACE_API_KEY: z.string().trim().optional(),
  HUGGINGFACE_TTS_VOICE_FEMALE: z.string().default("espnet/kan-bayashi_ljspeech_vits"),
  HUGGINGFACE_TTS_VOICE_MALE: z.string().default("facebook/mms-tts-eng"),

  // Gemini is a second, independent AI provider used only to cross-check the
  // safety-critical calls (drug-interaction checking and strip-photo
  // extraction) alongside whichever provider AI_PROVIDER already selects.
  // It is optional: when unset, dual-verify degrades to the single
  // configured provider exactly like today. It never replaces AI_PROVIDER.
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),
  // Gemini native text-to-speech: human-sounding, multilingual (Hindi + English
  // from the same voice — the model speaks whatever language the text is in).
  // The primary, free voice provider for elderly-friendly warmth and clarity.
  // gemini-2.5-flash-preview-tts is proven on the free tier; for even more
  // expressive delivery set GEMINI_TTS_MODEL=gemini-3.1-flash-tts-preview when
  // your key's project has access to it.
  GEMINI_TTS_MODEL: z.string().default("gemini-2.5-flash-preview-tts"),
  // Warm, human voices chosen for older listeners: Sulafat ("Warm") and Algieba
  // ("Smooth"). Any of Gemini's 30 prebuilt voice names is accepted.
  GEMINI_TTS_VOICE_FEMALE: z.string().default("Sulafat"),
  GEMINI_TTS_VOICE_MALE: z.string().default("Algieba"),
  // Separate, smaller daily cap: dual-verify calls Gemini alongside (not
  // instead of) the primary provider, so its budget is tracked independently
  // rather than doubling consumption against OPENAI_DAILY_LLM_REQUEST_LIMIT.
  GEMINI_DAILY_LLM_REQUEST_LIMIT: nonNegativeInt(6),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  // Preferred for SMS: Twilio Messaging Service handles sender pools and
  // regional compliance. A verified SMS-capable From number also works for a
  // small cohort.
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  PUBLIC_BASE_URL: z.string().optional(),
  // This is a public signing certificate fingerprint, but storing it as a
  // Worker secret keeps one deployment path for all Android release inputs.
  ANDROID_APP_CERT_SHA256: z.string().trim().optional(),
  REMINDER_CRON_TOKEN: z.string().trim().optional(),

  // D1/R2 is the isolated Cloudflare preview runtime. The production migration
  // documented in docs/08 moves health records to Supabase Postgres; local
  // development intentionally defaults to SQLite plus ./storage.
  DATABASE_DRIVER: z.enum(["sqlite", "d1"]).default("sqlite"),
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  // Keep Supabase Auth opt-in until the tenant schema, RLS policies, and
  // project credentials have been applied. The legacy access gate remains
  // the default so a partial configuration cannot lock users out.
  AUTH_DRIVER: z.enum(["access_gate", "supabase"]).default("access_gate"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().trim().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().optional(),
  // Authentication and the tenant data adapter have separate rollout gates.
  // This must remain false until the migration/RLS test suite and every
  // patient-data route are on the Supabase path.
  SUPABASE_TENANT_RUNTIME_READY: bool(false),
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
const groqConfigured = isConfiguredSecret(env.GROQ_API_KEY);
const geminiConfigured = isConfiguredSecret(env.GEMINI_API_KEY);
const supabaseUrlConfigured = isConfiguredSecret(env.SUPABASE_URL);
const supabaseAnonConfigured = isConfiguredSecret(env.SUPABASE_ANON_KEY);

const effectiveAiProvider =
  env.AI_PROVIDER ||
  (groqConfigured ? "groq" : geminiConfigured ? "gemini" : openAiConfigured ? "openai" : "groq");

const configIssues: string[] = [];
if (effectiveAiProvider === "openai" && !openAiConfigured) {
  configIssues.push("OPENAI_API_KEY is required when AI_PROVIDER=openai");
}
if (effectiveAiProvider === "nim" && !nimConfigured) {
  configIssues.push("NIM_API_KEY is required when AI_PROVIDER=nim");
}
if (effectiveAiProvider === "nim" && !env.NIM_MODEL) {
  configIssues.push("NIM_MODEL is required when AI_PROVIDER=nim");
}
if (effectiveAiProvider === "groq" && !groqConfigured) {
  configIssues.push("GROQ_API_KEY is required when AI_PROVIDER=groq");
}
if (effectiveAiProvider === "gemini" && !geminiConfigured) {
  configIssues.push("GEMINI_API_KEY is required when AI_PROVIDER=gemini");
}
if (env.AUTH_DRIVER === "supabase" && (!supabaseUrlConfigured || !supabaseAnonConfigured)) {
  configIssues.push("SUPABASE_URL and SUPABASE_ANON_KEY are required when AUTH_DRIVER=supabase");
}
if (configIssues.length > 0) {
  throw new Error(`Invalid environment configuration:\n${configIssues.map((issue) => `  - ${issue}`).join("\n")}`);
}

const llmApiKey =
  effectiveAiProvider === "nim" ? env.NIM_API_KEY!
  : effectiveAiProvider === "groq" ? env.GROQ_API_KEY!
  : effectiveAiProvider === "gemini" ? env.GEMINI_API_KEY!
  : env.OPENAI_API_KEY!;
const llmBaseUrl =
  effectiveAiProvider === "nim" ? env.NIM_BASE_URL
  : effectiveAiProvider === "groq" ? "https://api.groq.com/openai/v1"
  : effectiveAiProvider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai/"
  : env.OPENAI_BASE_URL;
const llmModel =
  effectiveAiProvider === "nim" ? env.NIM_MODEL!
  : effectiveAiProvider === "groq" ? env.GROQ_MODEL
  : effectiveAiProvider === "gemini" ? env.GEMINI_MODEL
  : env.OPENAI_MODEL;
const llmVisionModel =
  effectiveAiProvider === "groq" ? env.GROQ_VISION_MODEL : llmModel;

const twilioReady =
  isConfiguredSecret(env.TWILIO_ACCOUNT_SID) &&
  isConfiguredSecret(env.TWILIO_AUTH_TOKEN) &&
  isConfiguredSecret(env.TWILIO_FROM_NUMBER) &&
  !!env.PUBLIC_BASE_URL &&
  !env.PUBLIC_BASE_URL.includes("replace");
const smsReady =
  isConfiguredSecret(env.TWILIO_ACCOUNT_SID) &&
  isConfiguredSecret(env.TWILIO_AUTH_TOKEN) &&
  (isConfiguredSecret(env.TWILIO_MESSAGING_SERVICE_SID) || isConfiguredSecret(env.TWILIO_FROM_NUMBER)) &&
  !!env.PUBLIC_BASE_URL &&
  !env.PUBLIC_BASE_URL.includes("replace");

if (!twilioReady && typeof window === "undefined") {
  // eslint-disable-next-line no-console
  console.warn(
    "[config] Telephony disabled — Twilio env not fully set. Simulated calls still work.",
  );
}

export const config = {
  llmProvider: effectiveAiProvider,
  llmApiKey,
  llmBaseUrl,
  llmModel,
  /** Vision model (same as llmModel unless Groq, which uses Llama-4-Scout). */
  llmVisionModel,
  /** An optional OpenAI key used only for gpt-4o-mini-tts audio generation. */
  openAiTtsApiKey: openAiConfigured ? env.OPENAI_API_KEY! : null,
  openAiTtsEnabled: openAiConfigured,
  ttsModel: env.OPENAI_TTS_MODEL,
  openAiTtsVoiceFemale: env.OPENAI_TTS_VOICE_FEMALE,
  openAiTtsVoiceMale: env.OPENAI_TTS_VOICE_MALE,
  openAiDailyLlmRequestLimit: env.OPENAI_DAILY_LLM_REQUEST_LIMIT,
  openAiDailyTtsGenerationLimit: env.OPENAI_DAILY_TTS_GENERATION_LIMIT,

  // Hugging Face TTS (free open source SOTA voices)
  huggingfaceApiKey: isConfiguredSecret(env.HUGGINGFACE_API_KEY) ? env.HUGGINGFACE_API_KEY! : null,
  ttsVoiceFemale: isConfiguredSecret(env.HUGGINGFACE_API_KEY) ? env.HUGGINGFACE_TTS_VOICE_FEMALE : env.OPENAI_TTS_VOICE_FEMALE,
  ttsVoiceMale: isConfiguredSecret(env.HUGGINGFACE_API_KEY) ? env.HUGGINGFACE_TTS_VOICE_MALE : env.OPENAI_TTS_VOICE_MALE,

  // Second AI provider used only for dual-verify on safety-critical calls
  // (interactions + extraction). Disabled (skipped, not errored) when no key
  // is configured, so existing single-provider behaviour is unaffected.
  geminiEnabled: geminiConfigured,
  geminiApiKey: geminiConfigured ? env.GEMINI_API_KEY! : null,
  geminiModel: env.GEMINI_MODEL,
  geminiDailyLlmRequestLimit: env.GEMINI_DAILY_LLM_REQUEST_LIMIT,
  // Gemini native TTS — preferred human/multilingual voice provider.
  geminiTtsEnabled: geminiConfigured,
  geminiTtsModel: env.GEMINI_TTS_MODEL,
  geminiTtsVoiceFemale: env.GEMINI_TTS_VOICE_FEMALE,
  geminiTtsVoiceMale: env.GEMINI_TTS_VOICE_MALE,

  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  twilioFromNumber: env.TWILIO_FROM_NUMBER,
  twilioMessagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, ""),
  telephonyEnabled: twilioReady,
  smsEnabled: smsReady,
  androidAppCertSha256: env.ANDROID_APP_CERT_SHA256,
  reminderCronToken: env.REMINDER_CRON_TOKEN,

  databaseUrl: env.DATABASE_URL,
  databaseDriver: env.DATABASE_DRIVER,
  storageDriver: env.STORAGE_DRIVER,
  authDriver: env.AUTH_DRIVER,
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  // Server-only. It is intentionally never exposed through a NEXT_PUBLIC_
  // variable and normal household requests must continue to use RLS.
  supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseTenantRuntimeReady: env.SUPABASE_TENANT_RUNTIME_READY,
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
