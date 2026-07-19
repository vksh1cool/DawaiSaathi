import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Patient } from "@prisma/client";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";

/**
 * Single-household product: endpoints resolve "the" household/patient
 * server-side; the client never sends patientId (Arch §7).
 */

export async function getHousehold() {
  if (usesSupabaseAuth()) {
    const [{ createSupabaseServerClient }, { getSupabaseHousehold }] = await Promise.all([
      import("@/lib/supabase/server"),
      import("@/lib/supabase/household"),
    ]);
    const supabase = await createSupabaseServerClient();
    const hh = await getSupabaseHousehold(supabase);
    // Transform to match Prisma's output shape approximately if needed
    // The consumer usually just does hh?.patients[0]
    return hh ? { ...hh, patients: hh.patient ? [hh.patient] : [] } : null;
  }

  return prisma.household.findFirst({
    orderBy: { createdAt: "asc" },
    include: { patients: { orderBy: { createdAt: "asc" } } },
  });
}

export async function getPatient(): Promise<Patient | null> {
  const hh = await getHousehold();
  return (hh?.patients[0] as Patient) ?? null;
}

export async function getPatientOrThrow(): Promise<Patient> {
  const patient = await getPatient();
  if (!patient) {
    throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  }
  return patient;
}
