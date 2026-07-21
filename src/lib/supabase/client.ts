"use client";

import { useMemo } from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAppInfo } from "@/lib/app-info";

let cached: { url: string; anonKey: string; client: SupabaseClient } | null = null;

/**
 * Builds (and memoizes) the browser Supabase client from the publishable
 * URL/anon key. Never pass the service-role key here — the anon key plus
 * Postgres RLS is what scopes a signed-in browser session to its own
 * household; @supabase/ssr's default cookie storage keeps this client's
 * session visible to the server routes that read it via `next/headers`.
 */
export function getSupabaseBrowserClient(url: string, anonKey: string): SupabaseClient {
  if (cached && cached.url === url && cached.anonKey === anonKey) return cached.client;
  const client = createBrowserClient(url, anonKey);
  cached = { url, anonKey, client };
  return client;
}

/**
 * Convenience hook: reads the publishable Supabase config from
 * `/api/app-info` (populated once AUTH_DRIVER=supabase) and returns a
 * memoized client, or null while that config is not yet known.
 */
export function useSupabaseBrowserClient(): SupabaseClient | null {
  const { info } = useAppInfo();
  const url = info?.supabaseUrl;
  const anonKey = info?.supabaseAnonKey;
  return useMemo(() => {
    if (!url || !anonKey) return null;
    return getSupabaseBrowserClient(url, anonKey);
  }, [url, anonKey]);
}
