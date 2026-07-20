import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getSupabaseUserId } from "@/lib/supabase/server";
import { listSupabaseMedications } from "@/lib/supabase/medications";
import { prisma } from "@/lib/db";
import { getHousehold } from "@/lib/household";
import { serializeMedication } from "@/lib/medications";
import type { Patient } from "@prisma/client";
import { MedicationsClient } from "./MedicationsClient";

// Per-tenant data fetched per request; must not be statically prerendered.
export const dynamic = "force-dynamic";

async function fetchMedications() {
  const useSupabase = usesSupabaseAuth();
  if (useSupabase) {
    const userId = await getSupabaseUserId();
    if (!userId) redirect("/auth");
    const meds = await listSupabaseMedications();
    return meds.map((m) => ({
      ...m,
      expiryStatus: m.expiryStatus as "expired" | "expiring" | "ok" | "unknown",
    }));
  }

  const hh = await getHousehold();
  if (!hh) redirect("/onboarding");
  const patient = hh.patients[0] as Patient | undefined;
  if (!patient) redirect("/onboarding");

  const rows = await prisma.medication.findMany({
    where: { patientId: patient.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(serializeMedication);
}

async function MedicationsDataFetcher() {
  const medications = await fetchMedications();
  return <MedicationsClient initialMedications={medications} />;
}

export default function MedicationsPage() {
  return (
    <AppShell>
      <Suspense fallback={<Spinner />}>
        <MedicationsDataFetcher />
      </Suspense>
    </AppShell>
  );
}
