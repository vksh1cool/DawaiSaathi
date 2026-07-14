"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, ChevronRight, IndianRupee } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DoseGroupCard } from "@/components/DoseGroupCard";
import { AdherenceBar } from "@/components/AdherenceBar";
import { SimulatedCallModal } from "@/components/SimulatedCallModal";
import { PrimaryButton, Card, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import { formatInr } from "@/lib/util/money";
import type { TodayGroup, Finding } from "@/types/domain";

type Today = { groups: TodayGroup[] };
type Adherence = { percent: number; byDay: { date: string; confirmed: number; missed: number; pending: number }[] };

export default function HomePage() {
  const { t, lang } = useI18n();
  const { info } = useAppInfo();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [hasMeds, setHasMeds] = useState(false);
  const [today, setToday] = useState<Today>({ groups: [] });
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [topFinding, setTopFinding] = useState<Finding | null>(null);
  const [savings, setSavings] = useState(0);
  const [patientName, setPatientName] = useState("");
  const [openFindings, setOpenFindings] = useState(0);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Onboarding redirect.
  useEffect(() => {
    if (info && !info.hasHousehold) router.replace("/onboarding");
  }, [info, router]);

  const load = useCallback(async () => {
    try {
      const [meds, todayRes, adh, inter, gen, hh] = await Promise.all([
        apiGet<{ medications: unknown[] }>("/api/medications"),
        apiGet<Today>("/api/today"),
        apiGet<Adherence>("/api/adherence?days=7"),
        apiGet<{ open: Finding[] }>("/api/interactions"),
        apiGet<{ totalMonthlySavingsInr: number }>("/api/generics"),
        apiGet<{ household: { patient: { name: string } | null } }>("/api/household"),
      ]);
      setHasMeds(meds.medications.length > 0);
      setToday(todayRes);
      setAdherence(adh);
      setTopFinding(inter.open[0] ?? null);
      setOpenFindings(inter.open.length);
      setSavings(gen.totalMonthlySavingsInr);
      setPatientName(hh.household.patient?.name ?? "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  // Poll while any dose is still upcoming/calling (captures the live "confirmed" flip).
  useEffect(() => {
    const live = today.groups.some((g) => g.status === "upcoming");
    if (!live) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [today, load]);

  const callNow = async (time: string) => {
    try {
      await apiJson("/api/calls/now", "POST", { time });
      setToast(`📞 ${patientName}…`);
      load();
    } catch (e) {
      // Telephony off → fall back to simulated call.
      if (e instanceof ApiError && e.code === "TELEPHONY_DISABLED") setSimTime(time);
      else setToast(e instanceof ApiError ? e.message : "Call failed");
    }
  };

  const markGroup = async (group: TodayGroup) => {
    await Promise.all(
      group.doseEventIds.map((id) => apiJson(`/api/dose-events/${id}/mark`, "POST", { status: "confirmed" })),
    );
    load();
  };

  if (loading) {
    return (
      <AppShell safetyBadge={openFindings}>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  if (!hasMeds) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Camera size={48} className="text-[var(--color-primary)]" />
          <p className="text-[var(--color-text-muted)]">{t("home.empty")}</p>
          <Link href="/scan" className="w-full">
            <PrimaryButton>
              <Camera size={18} /> {t("home.scanCta")}
            </PrimaryButton>
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell safetyBadge={openFindings}>
      {/* Top interaction alert */}
      {topFinding && (
        <Link href="/safety" className="mb-3 block">
          <div className="flex items-center gap-2 rounded-[12px] bg-[var(--color-danger-soft)] px-3 py-3 text-[var(--color-danger)]">
            <AlertTriangle size={20} className="shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold uppercase">{t(`safety.sev${cap(topFinding.severity)}`)}</p>
              <p className="text-sm font-medium">
                {topFinding.brandA} + {topFinding.brandB}
              </p>
            </div>
            <ChevronRight size={18} />
          </div>
        </Link>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("home.today")}</h1>
        <Link href="/history" className="text-sm font-medium text-[var(--color-primary)]">
          {t("home.history")}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {today.groups.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">{t("history.empty")}</p>
            <Link href="/schedule" className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)]">
              {t("schedule.title")} →
            </Link>
          </Card>
        ) : (
          today.groups.map((g) => (
            <DoseGroupCard
              key={g.time}
              group={g}
              demoMode={info?.demoMode ?? false}
              onCallNow={callNow}
              onSimulate={(time) => setSimTime(time)}
              onMark={markGroup}
            />
          ))
        )}
      </div>

      {adherence && (
        <div className="mt-5">
          <Link href="/history">
            <AdherenceBar percent={adherence.percent} byDay={adherence.byDay} />
          </Link>
        </div>
      )}

      <Link href="/savings" className="mt-4 block">
        <div className="flex items-center justify-between rounded-[12px] bg-[var(--color-success-soft)] px-4 py-3">
          <span className="flex items-center gap-2 font-medium text-[var(--color-success)]">
            <IndianRupee size={18} />
            {t("home.savingTeaser", { amount: formatInr(savings), per: t("common.perMonth") })}
          </span>
          <ChevronRight size={18} className="text-[var(--color-success)]" />
        </div>
      </Link>

      {toast && (
        <div
          className="fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[var(--color-text)] px-4 py-2 text-sm text-white"
          onAnimationEnd={() => setToast(null)}
        >
          {toast}
        </div>
      )}

      {simTime && (
        <SimulatedCallModal
          time={simTime}
          patientName={patientName}
          onClose={() => {
            setSimTime(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
