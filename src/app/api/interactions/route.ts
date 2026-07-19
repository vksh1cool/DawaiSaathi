import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { InteractionsRepository } from "@/lib/interactions";

export const runtime = "nodejs";

/** GET /api/interactions — open + acknowledged findings (Arch §7.3). */
export const GET = withErrorBoundary(async () => {
  const { findings, lastRunAt } = await InteractionsRepository.listFindings();

  const severityRank: Record<string, number> = { major: 0, moderate: 1, minor: 2, unverified: 3 };

  const open = findings
    .filter((f) => !f.acknowledged)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const acknowledged = findings.filter((f) => f.acknowledged);

  return NextResponse.json({ open, acknowledged, lastRunAt });
});
