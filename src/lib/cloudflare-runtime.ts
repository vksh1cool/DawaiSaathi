import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Runtime switches are explicit rather than inferred from a hostname. On a
 * deployed OpenNext Worker, bindings live on the current request context —
 * they are not guaranteed to be mirrored onto `process.env`. Node development
 * and unit tests intentionally retain the normal environment fallback.
 */
export function getRuntimeValue(name: string): string | undefined {
  try {
    const env = getCloudflareContext().env as unknown as Record<string, unknown>;
    const value = env[name];
    if (typeof value === "string") return value;
  } catch {
    // There is no Worker request context during local Node work and build time.
  }
  return process.env[name];
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
