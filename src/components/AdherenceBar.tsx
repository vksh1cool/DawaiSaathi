"use client";

import { useI18n } from "@/lib/i18n/provider";

type DayBucket = { date: string; confirmed: number; notConfirmed: number; pending: number };

export function AdherenceBar({ confirmationRate, byDay }: { confirmationRate: number | null; byDay: DayBucket[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {t("home.weekAdherence")}
        </span>
        <span className="text-sm font-semibold">
          {confirmationRate === null ? t("home.noResolvedDoses") : t("home.takenPercent", { percent: confirmationRate })}
        </span>
      </div>
      <div className="flex gap-1" role="list" aria-label={t("home.weekAdherence")}>
        {byDay.map((d) => {
          const color =
            d.notConfirmed > 0
              ? "bg-[var(--color-warn)]"
              : d.confirmed > 0
                ? "bg-[var(--color-success)]"
                : "bg-[var(--color-border)]";
          const label = t("home.adherenceDay", {
            date: d.date,
            confirmed: d.confirmed,
            notConfirmed: d.notConfirmed,
            pending: d.pending,
          });
          return <div key={d.date} role="listitem" className={`h-2 flex-1 rounded-full ${color}`} title={label} aria-label={label} />;
        })}
      </div>
    </div>
  );
}
