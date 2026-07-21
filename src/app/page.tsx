import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Camera, ChevronRight, IndianRupee, ListChecks } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { AdherenceBar } from "@/components/AdherenceBar";
import { PrimaryButton, GhostButton, Card, Spinner } from "@/components/ui";
import { formatInr } from "@/lib/util/money";

import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { getPatient, getHousehold } from "@/lib/household";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { getToday } from "@/lib/dose-events";
import { getSupabaseToday } from "@/lib/supabase/dose-events";
import { listSupabaseMedications } from "@/lib/supabase/medications";
import { getAdherence } from "@/lib/dose-events";
import { getSupabaseAdherence } from "@/lib/supabase/dose-events";
import { getGenerics } from "@/lib/generics";
import { listSupabaseAlerts } from "@/lib/supabase/alerts";
import { prisma } from "@/lib/db";
import { InteractionsRepository } from "@/lib/interactions";
import { serializeMedication } from "@/lib/medications";
import { getSupabaseUserId } from "@/lib/supabase/server";
import type { Finding } from "@/types/domain";
import type { Patient } from "@prisma/client";

import { T } from "@/components/T";
import { Greeting } from "./Greeting";
import { PollLiveDoses } from "./PollLiveDoses";
import { AlertsList } from "./AlertsList";
import { SavingsBanner } from "./SavingsBanner";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function findingTone(severity: Finding["severity"]) {
  if (severity === "major") return "bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
  if (severity === "moderate") return "bg-[var(--color-warn-soft)] text-[var(--color-warn)]";
  if (severity === "minor") return "bg-[var(--color-info-soft)] text-[var(--color-info)]";
  return "bg-[var(--color-unverified-soft)] text-[var(--color-unverified)]";
}

async function getDashboardData() {
  const useSupabase = usesSupabaseAuth();
  
  if (useSupabase) {
    const userId = await getSupabaseUserId();
    if (!userId) redirect("/auth");
    const hh = await getSupabaseHousehold();
    if (!hh) redirect("/onboarding");

    const [meds, today, adh, gen, alerts] = await Promise.all([
      listSupabaseMedications(),
      getSupabaseToday(),
      getSupabaseAdherence(7).catch(() => null),
      getGenerics(hh.patient?.id ?? "").catch(() => ({ totalMonthlySavingsInr: 0 })),
      listSupabaseAlerts().catch(() => [])
    ]);

    // Interactions
    let openFindings: Finding[] = [];
    if (hh.patient) {
        const { findings } = await InteractionsRepository.listFindings().catch(() => ({ findings: [] }));
        
        const severityRank: Record<string, number> = { major: 0, moderate: 1, minor: 2, unverified: 3 };
        openFindings = findings
            .filter((f) => !f.acknowledged)
            .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    }

    return {
      hasMeds: meds.length > 0,
      today,
      patientName: hh.patient?.name ?? "",
      adherence: adh,
      topFinding: openFindings[0] ?? null,
      openFindingsCount: openFindings.length,
      savings: gen ? gen.totalMonthlySavingsInr : null,
      alerts
    };
  }

  // Legacy local D1/Postgres
  const hh = await getHousehold();
  if (!hh) redirect("/onboarding");
  const patient = hh.patients[0] as Patient | undefined;
  if (!patient) redirect("/onboarding");

  const medsRows = await prisma.medication.findMany({
    where: { patientId: patient.id, status: "active" },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  const meds = medsRows.map(serializeMedication);
  
  const today = await getToday(patient);

  const [adh, gen, alertRows, { findings }] = await Promise.all([
    getAdherence(patient, 7).catch(() => null),
    getGenerics(patient.id).catch(() => ({ totalMonthlySavingsInr: 0 })),
    prisma.caregiverAlert.findMany({
      where: { patientId: patient.id },
      orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
      take: 50,
    }).catch(() => []),
    InteractionsRepository.listFindings().catch(() => ({ findings: [] as Finding[] }))
  ]);

  const severityRank: Record<string, number> = { major: 0, moderate: 1, minor: 2, unverified: 3 };
  const openFindings = findings
    .filter((f) => !f.acknowledged)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const alerts = alertRows.map((a) => ({
    id: a.id,
    type: a.type,
    messageEn: a.messageEn,
    messageHi: a.messageHi,
    read: !!a.readAt,
    createdAt: a.createdAt.toISOString(),
  }));

  return {
    hasMeds: meds.length > 0,
    today,
    patientName: patient.name,
    adherence: adh,
    topFinding: openFindings[0] ?? null,
    openFindingsCount: openFindings.length,
    savings: gen ? gen.totalMonthlySavingsInr : null,
    alerts
  };
}

async function HomePageDataFetcher() {
  const data = await getDashboardData();
  const { hasMeds, today, patientName, adherence, topFinding, openFindingsCount, savings, alerts } = data;

  if (!hasMeds) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Camera size={48} className="text-[var(--color-primary)]" />
          <p className="text-[var(--color-text-muted)]"><T k="home.empty" /></p>
          <div className="flex w-full flex-col gap-2">
            <Link href="/scan" className="w-full">
              <PrimaryButton>
                <Camera size={18} /> <T k="home.scanCta" />
              </PrimaryButton>
            </Link>
            <Link href="/scan/picker" className="w-full">
              <GhostButton className="w-full">
                <ListChecks size={18} /> <T k="home.pickerCta" />
              </GhostButton>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell safetyBadge={openFindingsCount}>
      <Greeting name={patientName} />
      {/* Top interaction alert */}
      {topFinding && (
        <Link href="/safety" className="mb-3 block">
          <div
            className={`flex items-center gap-2 rounded-[12px] px-3 py-3 ${findingTone(topFinding.severity)}`}
          >
            <AlertTriangle size={20} className="shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold uppercase"><T k={`safety.sev${cap(topFinding.severity)}`} /></p>
              <p className="text-sm font-medium">
                {topFinding.brandA} + {topFinding.brandB}
              </p>
            </div>
            <ChevronRight size={18} />
          </div>
        </Link>
      )}

      <AlertsList initialAlerts={alerts} />

      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold"><T k="home.today" /></h1>
        <Link href="/history" className="pressable -mr-2 flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-medium text-[var(--color-primary)]">
          <T k="home.history" />
        </Link>
      </div>

      <PollLiveDoses initialToday={today} patientName={patientName} />

      {adherence && (
        <div className="mt-5">
          <Link href="/history">
            <AdherenceBar confirmationRate={adherence.confirmationRate} byDay={adherence.byDay} />
          </Link>
        </div>
      )}

      {savings !== null && savings > 0 && <SavingsBanner savings={savings} />}
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<AppShell safetyBadge={0}><Spinner label={<T k="common.loading" />} /></AppShell>}>
      <HomePageDataFetcher />
    </Suspense>
  );
}
