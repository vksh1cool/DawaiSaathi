"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, BellRing, Camera, ChevronRight, IndianRupee } from "lucide-react";
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
type Adherence = { confirmationRate: number | null; byDay: { date: string; confirmed: number; notConfirmed: number; pending: number }[] };
type CaregiverAlert = {
  id: string;
  type: string;
  messageEn: string;
  messageHi: string;
  read: boolean;
  createdAt: string;
};

export default function HomePage() {
  const { t, lang } = useI18n();
  const { info, unavailable, refresh } = useAppInfo();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [hasMeds, setHasMeds] = useState(false);
  const [today, setToday] = useState<Today>({ groups: [] });
  const [adherence, setAdherence] = useState<Adherence | null>(null);
  const [topFinding, setTopFinding] = useState<Finding | null>(null);
  const [savings, setSavings] = useState<number | null>(null);
  const [patientName, setPatientName] = useState("");
  const [openFindings, setOpenFindings] = useState(0);
  const [alerts, setAlerts] = useState<CaregiverAlert[]>([]);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { message, showMessage } = useTimedMessage();

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoadError(null);
      const [meds, todayRes, hh] = await Promise.all([
        apiGet<{ medications: unknown[] }>("/api/medications", { signal }),
        apiGet<Today>("/api/today", { signal }),
        apiGet<{ household: { patient: { name: string } | null } }>("/api/household", { signal }),
      ]);
      if (signal?.aborted) return;
      setHasMeds(meds.medications.length > 0);
      setToday(todayRes);
      setPatientName(hh.household.patient?.name ?? "");

      // These enrich the dashboard but should never turn a usable medicine
      // list into a blank error screen when one auxiliary endpoint is down.
      const [adh, inter, gen, alertResult] = await Promise.allSettled([
        apiGet<Adherence>("/api/adherence?days=7", { signal }),
        apiGet<{ open: Finding[] }>("/api/interactions", { signal }),
        apiGet<{ totalMonthlySavingsInr: number }>("/api/generics", { signal }),
        apiGet<{ alerts: CaregiverAlert[] }>("/api/alerts", { signal }),
      ]);
      if (signal?.aborted) return;

      setAdherence(adh.status === "fulfilled" ? adh.value : null);
      if (inter.status === "fulfilled") {
        setTopFinding(inter.value.open[0] ?? null);
        setOpenFindings(inter.value.open.length);
      }
      setSavings(gen.status === "fulfilled" ? gen.value.totalMonthlySavingsInr : null);
      setAlerts(alertResult.status === "fulfilled" ? alertResult.value.alerts : []);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setLoadError(t("home.loadError"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [t]);

  const loadTodayStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const todayRes = await apiGet<Today>("/api/today", { signal });
      if (signal?.aborted) return;
      setToday(todayRes);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!info) return;
    if (!info.hasHousehold) {
      router.replace("/onboarding");
      return;
    }
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [info, load, router]);

  // Poll while any dose is still upcoming/calling (captures the live "confirmed" flip).
  useEffect(() => {
    const live = today.groups.some((g) => g.status === "upcoming");
    if (!live) return;

    let pollAbort: AbortController | null = null;
    const poll = async () => {
      pollAbort = new AbortController();
      await loadTodayStatus(pollAbort.signal);
    };

    const id = setInterval(poll, 5000);
    return () => {
      clearInterval(id);
      pollAbort?.abort();
    };
  }, [today, loadTodayStatus]);

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

  const markAlertRead = async (alertId: string) => {
    try {
      await apiJson(`/api/alerts/${encodeURIComponent(alertId)}/read`, "POST");
      setAlerts((current) => current.map((alert) => (alert.id === alertId ? { ...alert, read: true } : alert)));
    } catch {
      showMessage(t("home.alertReadError"));
    }
  };

  if (!info && unavailable) {
    return (
      <AppShell safetyBadge={openFindings}>
        <Card tone="warn">
          <p className="text-sm">{t("home.bootstrapUnavailable")}</p>
          <PrimaryButton className="mt-3" onClick={() => void refresh()}>
            {t("common.tryAgain")}
          </PrimaryButton>
        </Card>
      </AppShell>
    );
  }

  if (!info || loading) {
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
          <PrimaryButton className="mt-3" onClick={() => void load()}>
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

  const unreadAlerts = alerts.filter((alert) => !alert.read);
  const latestAlert = unreadAlerts[0];

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

      {latestAlert && (
        <div className="mb-3" aria-live="polite">
          <Card tone="warn">
            <div className="flex items-start gap-3">
            <BellRing size={21} className="mt-0.5 shrink-0 text-[var(--color-warn)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("home.followUpTitle")}</p>
              <p className="mt-1 text-sm leading-5 text-[var(--color-text)]">
                {lang === "hi" ? latestAlert.messageHi : latestAlert.messageEn}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void markAlertRead(latestAlert.id)}
                  className="pressable min-h-[44px] rounded-[10px] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-primary)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
                >
                  {t("home.markAlertRead")}
                </button>
                <Link
                  href="/history"
                  className="pressable flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)]"
                >
                  {unreadAlerts.length > 1 ? t("home.followUpMore", { n: unreadAlerts.length }) : t("home.history")}
                </Link>
              </div>
            </div>
            </div>
          </Card>
        </div>
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
          today.groups.map((g, index) => (
            <div key={g.time} className="dose-group-card" style={{ animationDelay: `${index * 60}ms` }}>
              <DoseGroupCard
                group={g}
                patientName={patientName}
                demoMode={info?.demoMode ?? false}
                onCallNow={callNow}
                onSimulate={(time) => setSimTime(time)}
                onMark={markGroup}
              />
            </div>
          ))
        )}
      </div>

      {adherence && (
        <div className="mt-5">
          <Link href="/history">
            <AdherenceBar confirmationRate={adherence.confirmationRate} byDay={adherence.byDay} />
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
