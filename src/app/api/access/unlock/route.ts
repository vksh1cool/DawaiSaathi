import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accessCookieName,
  accessGateEnabled,
  accessGateSecretsConfigured,
  createAccessSession,
} from "@/lib/access-gate";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { secretsMatch } from "@/lib/secret";

const bodySchema = z.object({ password: z.string().min(1).max(512) });

export async function POST(request: Request) {
  if (!accessGateEnabled()) return NextResponse.json({ ok: true, gate: "disabled" });
  if (!accessGateSecretsConfigured()) {
    return NextResponse.json({ error: { code: "INTERNAL", message: "Access gate is not configured." } }, { status: 503 });
  }
  return withErrorBoundary(async () => {
    const { password } = bodySchema.parse(await request.json());
    const accepted = await secretsMatch(password, process.env.APP_ACCESS_PASSWORD);
    if (!accepted) throw new AppError("UNAUTHORIZED", "That access code is not correct.");

    const response = NextResponse.json({ ok: true });
    response.cookies.set(accessCookieName(), await createAccessSession(), {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return response;
  })();
}
