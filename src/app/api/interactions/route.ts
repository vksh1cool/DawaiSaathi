import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { serializeFinding } from "@/lib/interactions";

export const runtime = "nodejs";

/** GET /api/interactions — open + acknowledged findings (Arch §7.3). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const [rows, meds] = await Promise.all([
    prisma.interactionFinding.findMany({
      where: { patientId: patient.id },
      orderBy: [{ acknowledged: "asc" }, { createdAt: "desc" }],
    }),
    prisma.medication.findMany({ where: { patientId: patient.id }, select: { id: true, brandName: true } }),
  ]);
  const brandMap = new Map(meds.map((m) => [m.id, m.brandName]));

  const severityRank: Record<string, number> = { major: 0, moderate: 1, minor: 2, unverified: 3 };
  const findings = rows.map((r) => serializeFinding(r, brandMap));
  const open = findings
    .filter((f) => !f.acknowledged)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  const acknowledged = findings.filter((f) => f.acknowledged);
  const lastRun = rows[0]?.createdAt ?? null;

  return NextResponse.json({ open, acknowledged, lastRunAt: lastRun });
});
