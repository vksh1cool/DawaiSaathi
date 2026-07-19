"use client";

import { useI18n } from "@/lib/i18n/provider";

type DayBucket = { date: string; confirmed: number; notConfirmed: number; pending: number };

function trailingStreak(byDay: DayBucket[]): number {
  let streak = 0;
  for (let i = byDay.length - 1; i >= 0; i--) {
    const d = byDay[i];
    // Today may have nothing resolved yet; it should not break yesterday's streak.
    if (i === byDay.length - 1 && d.confirmed === 0 && d.notConfirmed === 0) continue;
    if (d.confirmed > 0 && d.notConfirmed === 0) streak++;
    else break;
  }
  return streak;
}

export function AdherenceBar({ confirmationRate, byDay }: { confirmationRate: number | null; byDay: DayBucket[] }) {
  const { t } = useI18n();
  const streak = trailingStreak(byDay);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {t("home.weekAdherence")}
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold">
          {streak >= 2 && (
            <span className="rounded-full bg-[var(--color-success-soft)] px-2 py-0.5 text-xs font-bold text-[var(--color-success)]">
              🔥 {t("home.streak", { n: streak })}
            </span>
          )}
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
