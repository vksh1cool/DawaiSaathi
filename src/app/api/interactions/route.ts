import { NextResponse } from "next/server";
import { withErrorBoundary } from "@/lib/errors";
import { InteractionsRepository, openFindingsBySeverity } from "@/lib/interactions";

export const runtime = "nodejs";

/** GET /api/interactions — open + acknowledged findings (Arch §7.3). */
export const GET = withErrorBoundary(async () => {
  const { findings, lastRunAt } = await InteractionsRepository.listFindings();

  const open = openFindingsBySeverity(findings);
  const acknowledged = findings.filter((f) => f.acknowledged);

  return NextResponse.json({ open, acknowledged, lastRunAt });
});
