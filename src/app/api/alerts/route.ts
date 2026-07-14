import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";

export const runtime = "nodejs";

/** GET /api/alerts — unread first (Arch §7.6). */
export const GET = withErrorBoundary(async () => {
  const patient = await getPatientOrThrow();
  const alerts = await prisma.caregiverAlert.findMany({
    where: { patientId: patient.id },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
  return NextResponse.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      messageEn: a.messageEn,
      messageHi: a.messageHi,
      read: !!a.readAt,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});
