import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  accessGateEnabled,
  accessGateSecretsConfigured,
  hasValidAccessSession,
} from "@/lib/access-gate";
import { getSupabasePublicConfig } from "@/lib/supabase/runtime";
import { supabaseTenantRuntimeReady, usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import {
  SUPABASE_STAGING_API_PATHS,
  SUPABASE_STAGING_PATHS,
  hasPendingSupabaseTenantRoutes,
  isPendingSupabaseHealthApiPath,
  isPendingSupabaseWorkspacePath,
  matchesAnyPath,
} from "@/lib/tenant-cutover";

const INFRASTRUCTURE_PUBLIC_PATHS = [
  "/api/twilio/",
  "/api/internal/reminders/run",
  "/api/audio/",
  "/api/feedback",
  "/icons/",
  "/sw.js",
  "/offline.html",
  // Cloudflare Assets 307-redirects /offline.html -> /offline; the service
  // worker follows it, so the redirect target must stay publicly reachable.
  "/offline",
  "/.well-known/assetlinks.json",
];

const ACCESS_GATE_PUBLIC_PATHS = ["/unlock", "/api/access/"];
const SUPABASE_PUBLIC_PATHS = ["/auth", "/api/auth/", "/api/app-info"];
function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/logo.png"
  );
}

function startsWithPath(pathname: string, paths: readonly string[]): boolean {
  return matchesAnyPath(pathname, paths);
}

function isInfrastructurePublicPath(pathname: string): boolean {
  return isStaticPath(pathname) || startsWithPath(pathname, INFRASTRUCTURE_PUBLIC_PATHS);
}

function isAccessGatePublicPath(pathname: string): boolean {
  return isInfrastructurePublicPath(pathname) || startsWithPath(pathname, ACCESS_GATE_PUBLIC_PATHS);
}

function isSupabasePublicPath(pathname: string): boolean {
  return isInfrastructurePublicPath(pathname) || startsWithPath(pathname, SUPABASE_PUBLIC_PATHS);
}

function apiError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

function loginUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  url.pathname = "/auth";
  url.search = "";
  url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  if (from.cookies.getAll().length > 0) {
    // Auth cookies and health-account responses must never be served from a
    // shared cache to another caregiver.
    to.headers.set("Cache-Control", "private, no-store");
  }
  return to;
}

function responseWithAuthCookies(response: NextResponse): NextResponse {
  if (response.cookies.getAll().length > 0) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

function isSupabaseStagingPath(pathname: string): boolean {
  return (
    startsWithPath(pathname, SUPABASE_STAGING_PATHS) ||
    startsWithPath(pathname, SUPABASE_STAGING_API_PATHS)
  );
}

async function protectWithSupabase(request: NextRequest): Promise<NextResponse> {
  const config = getSupabasePublicConfig();
  if (!config) {
    return request.nextUrl.pathname.startsWith("/api/")
      ? apiError(503, "INTERNAL", "Supabase Auth is enabled but not configured.")
      : new NextResponse("Deployment configuration incomplete: Supabase Auth credentials are required.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims() validates the access token and refreshes the SSR cookie when
  // needed. getSession() is deliberately not used for authorization.
  const { data, error } = await supabase.auth.getClaims();
  const userId = !error && typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  const pathname = request.nextUrl.pathname;

  if (isSupabasePublicPath(pathname)) return responseWithAuthCookies(response);
  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return copyCookies(response, apiError(401, "UNAUTHORIZED", "Caregiver sign-in is required."));
    }
    return copyCookies(response, NextResponse.redirect(loginUrl(request)));
  }

  // This response is tied to the verified caregiver identity, even when no
  // cookie happened to refresh on this particular request.
  response.headers.set("Cache-Control", "private, no-store");

  // Until every data route uses RLS-scoped Supabase access, a signed-in user
  // must never reach the old global D1 resolver. Onboarding and invitation
  // acceptance are the only tenant-safe workflows available during this gate.
  if (!supabaseTenantRuntimeReady()) {
    if (pathname.startsWith("/api/") && !startsWithPath(pathname, SUPABASE_STAGING_API_PATHS)) {
      return copyCookies(
        response,
        apiError(503, "TENANT_RUNTIME_PENDING", "Secure data migration is still being completed."),
      );
    }
    if (!pathname.startsWith("/api/") && !isSupabaseStagingPath(pathname)) {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/secure-setup";
      setupUrl.search = "";
      return copyCookies(response, NextResponse.redirect(setupUrl));
    }
  }

  // Defense in depth for accidental early flag flips. The env flag alone is
  // not allowed to expose a route until its pending cutover entry is removed.
  if (hasPendingSupabaseTenantRoutes()) {
    if (pathname.startsWith("/api/") && isPendingSupabaseHealthApiPath(pathname)) {
      return copyCookies(
        response,
        apiError(503, "TENANT_RUNTIME_PENDING", "This secure data route is still being migrated."),
      );
    }
    if (!pathname.startsWith("/api/") && isPendingSupabaseWorkspacePath(pathname)) {
      const setupUrl = request.nextUrl.clone();
      setupUrl.pathname = "/secure-setup";
      setupUrl.search = "";
      return copyCookies(response, NextResponse.redirect(setupUrl));
    }
  }

  return response;
}

export async function middleware(request: NextRequest) {
  if (usesSupabaseAuth()) return protectWithSupabase(request);

  if (!accessGateEnabled() || isAccessGatePublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!accessGateSecretsConfigured()) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return apiError(503, "INTERNAL", "Access gate is not configured.");
    }
    return new NextResponse("Deployment configuration incomplete: access gate secrets are required.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (await hasValidAccessSession(request.headers.get("cookie"))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return apiError(401, "UNAUTHORIZED", "Private access is required.");
  }

  const unlockUrl = request.nextUrl.clone();
  unlockUrl.pathname = "/unlock";
  unlockUrl.search = "";
  unlockUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(unlockUrl);
}
