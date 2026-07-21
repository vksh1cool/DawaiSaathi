"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FindingCard } from "@/components/FindingCard";
import { AuthenticityCard } from "@/components/AuthenticityCard";
import { Banner, Spinner, GhostButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import type { Finding, Salt } from "@/types/domain";

type InteractionsResponse = { open: Finding[]; acknowledged: Finding[]; lastRunAt: string | null };
type RunResponse = { findings: Finding[]; checkedMedsCount: number; degraded?: string };

type MedicationForPackCheck = {
  id: string;
  brandName: string;
  displayGeneric: string;
  manufacturer: string | null;
  mrpInr: number | null;
  expiryDate: string | null;
  batchNumber: string | null;
  form: string;
  salts: Salt[];
};

type SafetyTab = "interactions" | "packaging";

export default function SafetyPage() {
  const { t } = useI18n();
  const [data, setData] = useState<InteractionsResponse | null>(null);
  const [medications, setMedications] = useState<MedicationForPackCheck[]>([]);
  const [tab, setTab] = useState<SafetyTab>("interactions");
  const [rechecking, setRechecking] = useState(false);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [showAck, setShowAck] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const [resR, medsR] = await Promise.allSettled([
      apiGet<InteractionsResponse>("/api/interactions"),
      apiGet<{ medications: MedicationForPackCheck[] }>("/api/medications"),
    ]);
    // Before onboarding there is no household yet, so both calls reject with
    // NOT_FOUND. That is an empty state (nothing to check), not a load failure —
    // only surface the error banner for genuine (network / server) failures.
    const isEmptyState = (r: PromiseSettledResult<unknown>) =>
      r.status === "rejected" && r.reason instanceof ApiError && r.reason.code === "NOT_FOUND";
    const realFailure =
      (resR.status === "rejected" && !isEmptyState(resR)) ||
      (medsR.status === "rejected" && !isEmptyState(medsR));
    if (realFailure) {
      setLoadError(t("safety.loadError"));
      return;
    }
    setData(resR.status === "fulfilled" ? resR.value : { open: [], acknowledged: [], lastRunAt: null });
    setMedications(medsR.status === "fulfilled" ? medsR.value.medications : []);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = async () => {
    setRechecking(true);
    setDegraded(null);
    setActionError(null);
    try {
      const res = await apiJson<RunResponse>("/api/interactions/run", "POST");
      setDegraded(res.degraded ?? null);
      await load();
    } catch {
      setActionError(t("safety.recheckError"));
    } finally {
      setRechecking(false);
    }
  };

  const acknowledge = async (id: string) => {
    setAcknowledgingId(id);
    try {
      setActionError(null);
      await apiJson(`/api/interactions/${id}/acknowledge`, "POST");
      await load();
    } catch {
      setActionError(t("safety.acknowledgeError"));
    } finally {
      setAcknowledgingId(null);
    }
  };

  if (!data) {
    return (
      <AppShell>
        {loadError ? (
          <Banner tone="warn">
            <p>{loadError}</p>
            <GhostButton className="mt-3" onClick={() => void load()}>
              {t("common.tryAgain")}
            </GhostButton>
          </Banner>
        ) : (
          <Spinner label={t("common.loading")} />
        )}
      </AppShell>
    );
  }

  const date = data.lastRunAt ? new Date(data.lastRunAt).toLocaleDateString() : "—";
  const medCount = medications.length;

  return (
    <AppShell safetyBadge={data.open.length}>
      <h1 className="mb-1 text-2xl font-bold">{t("safety.title")}</h1>

      <div className="mb-4 flex gap-1 rounded-[10px] bg-[var(--color-bg)] p-1">
        <button
          type="button"
          onClick={() => setTab("interactions")}
          aria-pressed={tab === "interactions"}
          className={`min-h-[40px] flex-1 rounded-[8px] text-sm font-medium transition-colors ${
            tab === "interactions"
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
              : "text-[var(--color-text-muted)]"
          }`}
        >
          {t("safety.tabInteractions")}
        </button>
        <button
          type="button"
          onClick={() => setTab("packaging")}
          aria-pressed={tab === "packaging"}
          className={`min-h-[40px] flex-1 rounded-[8px] text-sm font-medium transition-colors ${
            tab === "packaging"
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
              : "text-[var(--color-text-muted)]"
          }`}
        >
          {t("safety.tabPackaging")}
        </button>
      </div>

      {tab === "interactions" && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-muted)]">{t("safety.checked", { n: medCount, date })}</p>
            <GhostButton onClick={recheck} disabled={rechecking} className="px-3">
              <RefreshCw size={16} className={rechecking ? "animate-spin" : ""} />
              {t("safety.recheck")}
            </GhostButton>
          </div>

          {degraded && (
            <div className="mb-3 mt-3">
              <Banner tone="warn">{t("safety.degraded")}</Banner>
            </div>
          )}
          {actionError && (
            <div className="mb-3 mt-3">
              <Banner tone="warn">{actionError}</Banner>
            </div>
          )}

          {data.open.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckCircle2 size={56} className="text-[var(--color-success)]" />
              <p className="text-lg font-semibold">{t("safety.noneTitle", { n: medCount })}</p>
              <p className="max-w-[300px] text-sm text-[var(--color-text-muted)]">
                {t("safety.noneBody")}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {data.open.map((f) => (
                <FindingCard key={f.id} finding={f} onAcknowledge={acknowledge} acknowledging={acknowledgingId === f.id} />
              ))}
            </div>
          )}

          {data.acknowledged.length > 0 && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setShowAck((v) => !v)}
                aria-expanded={showAck}
                className="flex items-center gap-1 text-sm font-medium text-[var(--color-text-muted)]"
              >
                {showAck ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t("safety.acknowledged", { n: data.acknowledged.length })}
              </button>
              {showAck && (
                <div className="mt-3 flex flex-col gap-3 opacity-70">
                  {data.acknowledged.map((f) => (
                    <FindingCard key={f.id} finding={f} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === "packaging" && (
        <div className="flex flex-col gap-3">
          {medications.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">{t("safety.noMedications")}</p>
          ) : (
            medications.map((med) => (
              <div key={med.id} className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {med.brandName || med.displayGeneric}
                </p>
                <AuthenticityCard
                  collapsible={false}
                  input={{
                    brandName: med.brandName,
                    manufacturer: med.manufacturer,
                    mrpInr: med.mrpInr,
                    expiryDate: med.expiryDate,
                    batchNumber: med.batchNumber,
                    form: med.form,
                    salts: med.salts,
                  }}
                />
              </div>
            ))
          )}
        </div>
      )}
    </AppShell>
  );
}
