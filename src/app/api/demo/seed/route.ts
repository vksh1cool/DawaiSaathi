import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { purgeAllData } from "@/lib/data-retention";
import { seedDemoHousehold } from "@/lib/demo";
import { AppError, withErrorBoundary } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";

/** Load the frozen Kamla Devi story only when the app explicitly runs in demo mode. */
export const POST = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) throw new AppError("NOT_FOUND", "Demo seed is not supported on Supabase.");
  if (!config.demoMode) throw new AppError("NOT_FOUND", "Not available.");
  const summary = await seedDemoHousehold();
  return NextResponse.json({ ok: true, summary });
});

/** Privacy control used by Profile: erase all local health data and assets. */
export const DELETE = withErrorBoundary(async () => {
  await purgeAllData();
  return NextResponse.json({ ok: true });
});
