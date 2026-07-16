import { NextRequest, NextResponse } from "next/server";
import {
  accessGateEnabled,
  accessGateSecretsConfigured,
  hasValidAccessSession,
} from "@/lib/access-gate";

const PUBLIC_PATHS = ["/unlock", "/api/access/", "/api/twilio/", "/api/internal/reminders/run", "/api/audio/"];

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/logo.png" ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(path))
  );
}

export async function middleware(request: NextRequest) {
  if (!accessGateEnabled() || isPublicPath(request.nextUrl.pathname)) return NextResponse.next();

  if (!accessGateSecretsConfigured()) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "INTERNAL", message: "Access gate is not configured." } }, { status: 503 });
    }
    return new NextResponse("Deployment configuration incomplete: access gate secrets are required.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (await hasValidAccessSession(request.headers.get("cookie"))) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Private access is required." } }, { status: 401 });
  }

  const unlockUrl = request.nextUrl.clone();
  unlockUrl.pathname = "/unlock";
  unlockUrl.search = "";
  unlockUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(unlockUrl);
}
