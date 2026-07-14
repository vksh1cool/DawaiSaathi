"use client";

import { useI18n } from "@/lib/i18n/provider";

type DayBucket = { date: string; confirmed: number; missed: number; pending: number };

export function AdherenceBar({ percent, byDay }: { percent: number; byDay: DayBucket[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {t("home.weekAdherence")}
        </span>
        <span className="text-sm font-semibold">{t("home.takenPercent", { percent })}</span>
      </div>
      <div className="flex gap-1">
        {byDay.map((d) => {
          const color =
            d.missed > 0
              ? "bg-[var(--color-danger)]"
              : d.confirmed > 0
                ? "bg-[var(--color-success)]"
                : "bg-[var(--color-border)]";
          return <div key={d.date} className={`h-2 flex-1 rounded-full ${color}`} title={d.date} />;
        })}
      </div>
    </div>
  );
}
