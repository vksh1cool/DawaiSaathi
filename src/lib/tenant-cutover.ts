/**
 * Supabase Auth can be tested before the whole health-data adapter is migrated.
 * These lists keep that rollout fail-closed: deleting an entry is a code-review
 * event that must happen with the matching Supabase/RLS route implementation.
 */

export const SUPABASE_STAGING_PATHS = ["/onboarding", "/invite", "/secure-setup"] as const;
export const SUPABASE_STAGING_API_PATHS = ["/api/household"] as const;

export const SUPABASE_PENDING_WORKSPACE_PATHS = [] as const;

export const SUPABASE_PENDING_HEALTH_API_PATHS = [
  // /api/simulate stays pending: it is dev/QA tooling for simulating a call
  // outcome without dialing Twilio (/api/simulate/start, /api/simulate/digits)
  // and has no Supabase-tenant branch yet — intentionally out of scope.
  "/api/simulate",
] as const;

function pathMatches(pathname: string, prefix: string): boolean {
  const normalized = prefix !== "/" && prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname === normalized || pathname.startsWith(`${normalized}/`);
}

export function matchesAnyPath(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathMatches(pathname, prefix));
}

export function hasPendingSupabaseTenantRoutes(): boolean {
  return SUPABASE_PENDING_WORKSPACE_PATHS.length > 0 || SUPABASE_PENDING_HEALTH_API_PATHS.length > 0;
}

export function isPendingSupabaseWorkspacePath(pathname: string): boolean {
  return matchesAnyPath(pathname, SUPABASE_PENDING_WORKSPACE_PATHS);
}

export function isPendingSupabaseHealthApiPath(pathname: string): boolean {
  return matchesAnyPath(pathname, SUPABASE_PENDING_HEALTH_API_PATHS);
}
