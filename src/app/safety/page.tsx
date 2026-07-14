"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { FindingCard } from "@/components/FindingCard";
import { Banner, Spinner, GhostButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet, apiJson } from "@/lib/api-client";
import type { Finding } from "@/types/domain";

type InteractionsResponse = { open: Finding[]; acknowledged: Finding[]; lastRunAt: string | null };
type RunResponse = { findings: Finding[]; checkedMedsCount: number; degraded?: string };

export default function SafetyPage() {
  const { t } = useI18n();
  const [data, setData] = useState<InteractionsResponse | null>(null);
  const [medCount, setMedCount] = useState<number>(0);
  const [rechecking, setRechecking] = useState(false);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [showAck, setShowAck] = useState(false);

  const load = useCallback(async () => {
    const [res, meds] = await Promise.all([
      apiGet<InteractionsResponse>("/api/interactions"),
      apiGet<{ medications: unknown[] }>("/api/medications"),
    ]);
    setData(res);
    setMedCount(meds.medications.length);
  }, []);

  useEffect(() => {
    load().catch(() => setData({ open: [], acknowledged: [], lastRunAt: null }));
  }, [load]);

  const recheck = async () => {
    setRechecking(true);
    setDegraded(null);
    try {
      const res = await apiJson<RunResponse>("/api/interactions/run", "POST");
      setDegraded(res.degraded ?? null);
      await load();
    } finally {
      setRechecking(false);
    }
  };

  const acknowledge = async (id: string) => {
    await apiJson(`/api/interactions/${id}/acknowledge`, "POST");
    await load();
  };

  if (!data) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  const date = data.lastRunAt ? new Date(data.lastRunAt).toLocaleDateString() : "—";

  return (
    <AppShell safetyBadge={data.open.length}>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("safety.title")}</h1>
        <GhostButton onClick={recheck} disabled={rechecking} className="px-3">
          <RefreshCw size={16} className={rechecking ? "animate-spin" : ""} />
          {t("safety.recheck")}
        </GhostButton>
      </div>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        {t("safety.checked", { n: medCount, date })}
      </p>

      {degraded && (
        <div className="mb-3">
          <Banner tone="warn">{t("safety.degraded")}</Banner>
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
        <div className="flex flex-col gap-3">
          {data.open.map((f) => (
            <FindingCard key={f.id} finding={f} onAcknowledge={acknowledge} />
          ))}
        </div>
      )}

      {data.acknowledged.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowAck((v) => !v)}
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
    </AppShell>
  );
}
