import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { assertSupabaseAuthConfig } from "@/lib/supabase/runtime";

/**
 * Server-only Supabase client for the staged Auth migration. It uses the
 * publishable/anon key plus the user's cookies, so queries respect Postgres
 * RLS. Never substitute the service-role key here.
 */
export async function createSupabaseServerClient() {
  const config = assertSupabaseAuthConfig();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const clientIp = headerStore.get("cf-connecting-ip") || headerStore.get("x-forwarded-for");

  return createServerClient(config.url, config.anonKey, {
    global: {
      headers: clientIp ? { "x-forwarded-for": clientIp } : undefined,
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies. A middleware refresh
          // handles that case once AUTH_DRIVER=supabase is enabled.
        }
      },
    },
  });
}

/**
 * Validates the request JWT before an authenticated route derives a tenant.
 * `getClaims()` verifies the token; `getSession()` alone is not an identity
 * check because its cookie payload is not trusted input.
 */
export async function getSupabaseUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims.sub || typeof data.claims.sub !== "string") return null;
  return data.claims.sub;
}
