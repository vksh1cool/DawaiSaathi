import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Patient } from "@prisma/client";

/**
 * Single-household product: endpoints resolve "the" household/patient
 * server-side; the client never sends patientId (Arch §7).
 */

export async function getHousehold() {
  return prisma.household.findFirst({
    orderBy: { createdAt: "asc" },
    include: { patients: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getPatient(): Promise<Patient | null> {
  const hh = await getHousehold();
  return hh?.patients[0] ?? null;
}

export async function getPatientOrThrow(): Promise<Patient> {
  const patient = await getPatient();
  if (!patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return patient;
}
