import { getCloudflareContext } from "@opennextjs/cloudflare";
import { config } from "@/lib/config";

/**
 * Runtime switches are explicit rather than inferred from a hostname. On a
 * deployed OpenNext Worker, bindings live on the current request context —
 * they are not guaranteed to be mirrored onto `process.env`. Node development
 * and unit tests intentionally retain the normal environment fallback.
 *
 * Inside an actual Worker request (getCloudflareContext() succeeds), this
 * must NOT fall through to `process.env` for a var that simply isn't set in
 * wrangler.jsonc's `vars`. OpenNext bakes whatever `.env*` files were present
 * on the machine that ran `opennextjs-cloudflare build` into
 * `.open-next/cloudflare/next-env.mjs`, and applies those as `process.env`
 * defaults (`??=`) at Worker startup for any key the Cloudflare binding
 * didn't already provide. A developer's local `.env` (e.g. `AUTH_DRIVER=supabase`
 * for testing the Supabase rollout) would then silently override the
 * intentional absence of that var in wrangler.jsonc once deployed — flipping
 * feature flags like `usesSupabaseAuth()` on in production. Only fall back to
 * `process.env` when there is no Cloudflare request context at all (local
 * `next dev`/build/tests), matching the comment above.
 */
export function getRuntimeValue(name: string): string | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const value = env[name];
    return typeof value === "string" ? value : undefined;
  } catch {
    // There is no Worker request context during local Node work and build time.
    return process.env[name];
  }
}

export const usesD1 = () => getRuntimeValue("DATABASE_DRIVER") === "d1";
export const usesR2 = () => getRuntimeValue("STORAGE_DRIVER") === "r2";
export const accessGateRequired = () => getRuntimeValue("REQUIRE_ACCESS_GATE") === "true";
/** Auth mode is explicit. Never infer tenancy from a hostname or cookie. */
export const usesSupabaseAuth = () => getRuntimeValue("AUTH_DRIVER") === "supabase";
/**
 * This remains false until the Supabase migration, RLS checks, and the full
 * data adapter have passed. It prevents a signed-in Supabase user from ever
 * falling through to the legacy global D1 household resolver.
 */
export const supabaseTenantRuntimeReady = () => getRuntimeValue("SUPABASE_TENANT_RUNTIME_READY") === "true";
/**
 * The legacy D1 reminder system is global-demo data, not Supabase tenant data.
 * Once Supabase Auth is selected, no cron job or Twilio callback may touch
 * the old tables. A future Supabase reminder/SMS adapter must remove these
 * legacy call sites rather than making this helper return false.
 */
export const legacyTenantDataBlocked = () => usesSupabaseAuth();

const isRealSecret = (value: string | null | undefined): value is string =>
  !!value && !/^(replace|your[-_ ]|<|changeme|example)/i.test(value.trim());

/**
 * Ordered list of Gemini API keys, resolved at REQUEST time.
 *
 * `config` (src/lib/config.ts) is frozen from `process.env` at module load.
 * That is correct locally, but on a deployed OpenNext Worker the live keys are
 * delivered on the request-scoped Cloudflare secret binding
 * (`wrangler secret put GEMINI_API_KEY` / `GEMINI_API_KEY_2`) — which is NOT
 * present on `process.env` when config.ts is first evaluated. Reading the
 * binding here (with the build-time config value as a fallback for local dev,
 * tests, and secrets that happen to be baked in) is what makes the deployed
 * scan/TTS actually see a key. Two keys give the router a failover path so a
 * single rate-limited or quota-capped key cannot break a live demo.
 */
export function getGeminiApiKeys(): string[] {
  const candidates = [
    getRuntimeValue("GEMINI_API_KEY") ?? config.geminiApiKey,
    getRuntimeValue("GEMINI_API_KEY_2") ?? config.geminiApiKey2,
  ];
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const candidate of candidates) {
    if (!isRealSecret(candidate)) continue;
    const key = candidate.trim();
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/** True when at least one usable Gemini key is available in this request. */
export const geminiEnabledAtRuntime = (): boolean => getGeminiApiKeys().length > 0;

/** Gemini text/vision model, request-time (binding first, config fallback). */
export const getGeminiModel = (): string =>
  getRuntimeValue("GEMINI_MODEL") ?? config.geminiModel;

/** Gemini native-TTS model, request-time (binding first, config fallback). */
export const getGeminiTtsModel = (): string =>
  getRuntimeValue("GEMINI_TTS_MODEL") ?? config.geminiTtsModel;

export function getD1Binding(): D1Database {
  const db = getCloudflareContext().env.DAWAISAATHI_DB;
  if (!db) throw new Error("Cloudflare D1 binding DAWAISAATHI_DB is not configured.");
  return db;
}

export function getAssetBucket(): R2Bucket {
  const bucket = getCloudflareContext().env.DAWAISAATHI_ASSETS;
  if (!bucket) throw new Error("Cloudflare R2 binding DAWAISAATHI_ASSETS is not configured.");
  return bucket;
}
