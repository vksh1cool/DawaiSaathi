"use client";

import { CheckCircle2, Circle, XCircle, PhoneCall } from "lucide-react";
import { Card, GhostButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { pretty12h, slotKeyForTime } from "@/lib/util/dates";
import type { TodayGroup, Language } from "@/types/domain";

export function DoseGroupCard({
  group,
  demoMode,
  onCallNow,
  onSimulate,
  onMark,
}: {
  group: TodayGroup;
  demoMode: boolean;
  onCallNow: (time: string) => void;
  onSimulate: (time: string) => void;
  onMark: (group: TodayGroup) => void;
}) {
  const { t, lang } = useI18n();
  const slot = slotKeyForTime(group.time);
  const medNames = group.meds.map((m) => m.brandName).join(" · ");

  const tone =
    group.status === "confirmed" ? "success" : group.status === "missed" ? "danger" : "surface";
  const Icon =
    group.status === "confirmed" ? CheckCircle2 : group.status === "missed" ? XCircle : Circle;
  const iconColor =
    group.status === "confirmed"
      ? "text-[var(--color-success)]"
      : group.status === "missed"
        ? "text-[var(--color-danger)]"
        : "text-[var(--color-text-muted)]";

  return (
    <Card tone={tone} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon size={22} className={iconColor} />
        <span className="text-lg font-semibold">{pretty12h(group.time, lang as Language)}</span>
        <span className="text-sm text-[var(--color-text-muted)]">
          · {t(`schedule.${slot}`)} · {t("home.medsCount", { n: group.meds.length })}
        </span>
      </div>
      <p className="text-sm text-[var(--color-text)]">{medNames}</p>

      {group.status === "confirmed" && (
        <p className="text-sm text-[var(--color-success)]">{t("home.confirmedManual")}</p>
      )}
      {group.status === "missed" && (
        <div className="flex gap-2">
          <GhostButton className="flex-1 text-sm" onClick={() => onMark(group)}>
            {t("home.markTaken")}
          </GhostButton>
        </div>
      )}
      {group.status === "upcoming" && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-text-muted)]">{t("home.ringsAt", { name: "", time: group.time })}</p>
          {demoMode && (
            <div className="flex gap-2">
              <button
                onClick={() => onSimulate(group.time)}
                className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium"
              >
                {t("call.simTitle", { name: "" }).replace("…", "")}
              </button>
              <button
                onClick={() => onCallNow(group.time)}
                className="flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                <PhoneCall size={12} /> {t("home.callNow")}
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
