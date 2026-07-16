"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Camera, ChevronRight, IndianRupee } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DoseGroupCard } from "@/components/DoseGroupCard";
import { AdherenceBar } from "@/components/AdherenceBar";
import { SimulatedCallModal } from "@/components/SimulatedCallModal";
import { PrimaryButton, Card, Spinner, Toast } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import { formatInr } from "@/lib/util/money";
import { useTimedMessage } from "@/lib/use-timed-message";
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
  const [savings, setSavings] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [openFindings, setOpenFindings] = useState(0);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { message, showMessage } = useTimedMessage();

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const [meds, todayRes, hh] = await Promise.all([
        apiGet<{ medications: unknown[] }>("/api/medications"),
        apiGet<Today>("/api/today"),
        apiGet<{ household: { patient: { name: string } | null } }>("/api/household"),
      ]);
      setHasMeds(meds.medications.length > 0);
      setToday(todayRes);
      setPatientName(hh.household.patient?.name ?? "");

      // These enrich the dashboard but should never turn a usable medicine
      // list into a blank error screen when one auxiliary endpoint is down.
      const [adh, inter, gen] = await Promise.allSettled([
        apiGet<Adherence>("/api/adherence?days=7"),
        apiGet<{ open: Finding[] }>("/api/interactions"),
        apiGet<{ totalMonthlySavingsInr: number }>("/api/generics"),
      ]);
      setAdherence(adh.status === "fulfilled" ? adh.value : null);
      if (inter.status === "fulfilled") {
        setTopFinding(inter.value.open[0] ?? null);
        setOpenFindings(inter.value.open.length);
      }
      setSavings(gen.status === "fulfilled" ? gen.value.totalMonthlySavingsInr : null);
    } catch {
      setLoadError(t("home.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!info) return;
    if (!info.hasHousehold) {
      router.replace("/onboarding");
      return;
    }
    void load();
  }, [info, load, router]);

  // Poll while any dose is still upcoming/calling (captures the live "confirmed" flip).
  useEffect(() => {
    const live = today.groups.some((g) => g.status === "upcoming");
    if (!live) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [today, load]);

  const callNow = async (time: string) => {
    try {
      const result = await apiJson<{ placed: boolean }>("/api/calls/now", "POST", { time });
      if (!result.placed) throw new ApiError("UPSTREAM_TWILIO", t("home.callFailed"));
      showMessage(t("home.callStarting", { name: patientName }));
      void load();
    } catch (e) {
      // Telephony off → fall back to simulated call.
      if (e instanceof ApiError && e.code === "TELEPHONY_DISABLED") setSimTime(time);
      else showMessage(e instanceof ApiError ? e.message : t("home.callFailed"));
    }
  };

  const markGroup = async (group: TodayGroup) => {
    try {
      await apiJson("/api/dose-events/group/mark", "POST", { doseEventIds: group.doseEventIds });
      void load();
    } catch (error) {
      showMessage(error instanceof ApiError ? error.message : t("home.markFailed"));
    }
  };

  if (loading) {
    return (
      <AppShell safetyBadge={openFindings}>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell safetyBadge={openFindings}>
        <Card tone="warn">
          <p className="text-sm">{loadError}</p>
          <PrimaryButton className="mt-3" onClick={load}>
            {t("common.tryAgain")}
          </PrimaryButton>
        </Card>
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
          <div
            className={`flex items-center gap-2 rounded-[12px] px-3 py-3 ${findingTone(topFinding.severity)}`}
          >
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
        <Link href="/history" className="pressable -mr-2 flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-medium text-[var(--color-primary)]">
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
              patientName={patientName}
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

      {savings !== null && savings > 0 && (
        <Link href="/savings" className="mt-4 block">
          <div className="flex items-center justify-between rounded-[12px] bg-[var(--color-success-soft)] px-4 py-3">
            <span className="flex items-center gap-2 font-medium text-[var(--color-success)]">
              <IndianRupee size={18} />
              {t("home.savingTeaser", { amount: formatInr(savings), per: t("common.perMonth") })}
            </span>
            <ChevronRight size={18} className="text-[var(--color-success)]" />
          </div>
        </Link>
      )}

      {message && <Toast>{message}</Toast>}

      {simTime && (
        <SimulatedCallModal
          time={simTime}
          patientName={patientName}
          onClose={(resolved) => {
            setSimTime(null);
            if (!resolved) showMessage(t("call.simFailed"));
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function findingTone(severity: Finding["severity"]) {
  if (severity === "major") return "bg-[var(--color-danger-soft)] text-[var(--color-danger)]";
  if (severity === "moderate") return "bg-[var(--color-warn-soft)] text-[var(--color-warn)]";
  if (severity === "minor") return "bg-[var(--color-info-soft)] text-[var(--color-info)]";
  return "bg-[var(--color-unverified-soft)] text-[var(--color-unverified)]";
}
