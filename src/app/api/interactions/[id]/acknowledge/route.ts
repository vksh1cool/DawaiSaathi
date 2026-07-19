import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { InteractionsRepository } from "@/lib/interactions";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/interactions/:id/acknowledge (Arch §7.3, US-5). */
export const POST = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const finding = await InteractionsRepository.acknowledgeFinding(id);
  return NextResponse.json({ finding });
});
