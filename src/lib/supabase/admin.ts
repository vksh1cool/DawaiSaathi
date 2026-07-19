import "server-only";

import { createClient } from "@supabase/supabase-js";
import { config } from "@/lib/config";

/**
 * Service Role client for Supabase.
 * ONLY for use in background workers, webhooks, or when explicitly bypassing RLS.
 * Never use this in normal authenticated routes.
 */
export function createSupabaseAdminClient() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("Supabase service role config is missing.");
  }
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
