import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getHousehold } from "@/lib/household";
import { config } from "@/lib/config";
import { householdSchema, patchHouseholdSchema } from "@/lib/validation";

export const runtime = "nodejs";

function serialize(hh: NonNullable<Awaited<ReturnType<typeof getHousehold>>>) {
  const p = hh.patients[0];
  return {
    household: {
      id: hh.id,
      caregiverName: hh.caregiverName,
      uiLanguage: hh.uiLanguage,
      patient: p
        ? {
            id: p.id,
            name: p.name,
            phoneE164: p.phoneE164,
            language: p.language,
            voiceGender: p.voiceGender,
            timezone: p.timezone,
          }
        : null,
    },
  };
}

/** GET /api/household (Arch §7.1). 404 drives onboarding. */
export const GET = withErrorBoundary(async () => {
  const hh = await getHousehold();
  if (!hh) throw new AppError("NOT_FOUND", "No household yet.");
  return NextResponse.json(serialize(hh));
});

/** POST /api/household (Arch §7.1). */
export const POST = withErrorBoundary(async (req: Request) => {
  const existing = await getHousehold();
  if (existing) throw new AppError("CONFLICT", "A household already exists.");
  const body = householdSchema.parse(await req.json());

  const hh = await prisma.household.create({
    data: {
      caregiverName: body.caregiverName,
      uiLanguage: body.uiLanguage,
      patients: {
        create: {
          name: body.patient.name,
          phoneE164: body.patient.phoneE164,
          language: body.patient.language,
          voiceGender: body.patient.voiceGender,
          timezone: config.defaultTz,
        },
      },
    },
    include: { patients: true },
  });
  return NextResponse.json(serialize(hh), { status: 201 });
});

/** PATCH /api/household (Arch §7.1). */
export const PATCH = withErrorBoundary(async (req: Request) => {
  const hh = await getHousehold();
  if (!hh) throw new AppError("NOT_FOUND", "No household yet.");
  const body = patchHouseholdSchema.parse(await req.json());

  await prisma.$transaction(async (tx) => {
    if (body.caregiverName !== undefined || body.uiLanguage !== undefined) {
      await tx.household.update({
        where: { id: hh.id },
        data: { caregiverName: body.caregiverName, uiLanguage: body.uiLanguage },
      });
    }
    if (body.patient && hh.patients[0]) {
      await tx.patient.update({ where: { id: hh.patients[0].id }, data: body.patient });
    }
  });

  const updated = await getHousehold();
  return NextResponse.json(serialize(updated!));
});
