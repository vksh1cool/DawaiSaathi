"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Filter } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AdherenceBar } from "@/components/AdherenceBar";
import { CallLogRow, CallLog } from "@/components/CallLogRow";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type Adherence = {
  confirmationRate: number | null;
  byDay: { date: string; confirmed: number; notConfirmed: number; pending: number }[];
};
type CallFilter = "all" | "confirmed" | "not_confirmed";

export function HistoryClient({ adherence, calls }: { adherence: Adherence | null, calls: CallLog[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<CallFilter>("all");

  const filteredCalls = calls.filter((c) => {
    if (filter === "confirmed") return c.outcome === "confirmed";
    if (filter === "not_confirmed") return c.outcome === "not_answered" || c.outcome === "no_input" || c.outcome === "failed";
    return true;
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          aria-label={t("common.back")}
          className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)]"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{t("home.history")}</h1>
      </div>

      {adherence && (
        <Card className="mb-6">
          <AdherenceBar confirmationRate={adherence.confirmationRate} byDay={adherence.byDay} />
        </Card>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">{t("history.callLogs")}</h2>
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-[var(--color-text-muted)]" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as CallFilter)}
            className="min-h-[44px] rounded-full bg-[var(--color-bg)] px-3 py-1 text-sm outline-none ring-1 ring-[var(--color-border)] focus:ring-[var(--color-primary)]"
          >
            <option value="all">{t("history.filterAll")}</option>
            <option value="confirmed">{t("history.filterConfirmed")}</option>
            <option value="not_confirmed">{t("history.filterMissed")}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filteredCalls.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--color-text-muted)]">
            {t("history.empty")}
          </div>
        ) : (
          filteredCalls.map((log) => <CallLogRow key={log.id} log={log} />)
        )}
      </div>
    </AppShell>
  );
}
