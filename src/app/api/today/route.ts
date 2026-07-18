import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { TodayRepository } from "@/lib/repositories/today";

export const runtime = "nodejs";

/** GET /api/today — today's dose groups (Arch §7.5). */
export const GET = withErrorBoundary(async () => {
  const todayGroups = await TodayRepository.getTodayGroups();
  return NextResponse.json(todayGroups);
});
