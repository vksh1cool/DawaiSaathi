import { getRuntimeValue, usesSupabaseAuth } from "@/lib/cloudflare-runtime";

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

/**
 * Reads the publishable Supabase connection details from the current Worker
 * request when deployed, with the normal local environment fallback. The
 * service-role credential is deliberately not part of this module.
 */
export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  const url = getRuntimeValue("SUPABASE_URL")?.trim();
  const anonKey = getRuntimeValue("SUPABASE_ANON_KEY")?.trim();
  if (!url || !anonKey) return null;
  try {
    new URL(url);
  } catch {
    return null;
  }
  return { url: url.replace(/\/$/, ""), anonKey };
}

export function assertSupabaseAuthConfig(): SupabasePublicConfig {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      usesSupabaseAuth()
        ? "Supabase Auth is enabled but SUPABASE_URL or SUPABASE_ANON_KEY is missing."
        : "Supabase Auth is not configured.",
    );
  }
  return config;
}
