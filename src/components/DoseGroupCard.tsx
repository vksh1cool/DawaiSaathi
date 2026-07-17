"use client";

import { AlertTriangle, CalendarX, CheckCircle2, Circle, PhoneCall } from "lucide-react";
import { Card, GhostButton } from "@/components/ui";
import { HighRiskBanner } from "@/components/HighRiskBanner";
import { useI18n } from "@/lib/i18n/provider";
import { pretty12h, slotKeyForTime } from "@/lib/util/dates";
import type { TodayGroup, Language } from "@/types/domain";

export function DoseGroupCard({
  group,
  patientName,
  demoMode,
  onCallNow,
  onSimulate,
  onMark,
}: {
  group: TodayGroup;
  patientName: string;
  demoMode: boolean;
  onCallNow: (time: string) => void;
  onSimulate: (time: string) => void;
  onMark: (group: TodayGroup) => void;
}) {
  const { t, lang } = useI18n();
  const slot = slotKeyForTime(group.time);
  const medNames = group.meds.map((m) => m.brandName).join(" · ");
  const highRiskMeds = group.meds.filter((med) => med.highRisk);
  const expiredMeds = group.meds.filter((med) => med.expiryStatus === "expired");
  const expiringMeds = group.meds.filter((med) => med.expiryStatus === "expiring");

  const tone =
    group.status === "confirmed" ? "success" : group.status === "not_confirmed" ? "warn" : "surface";
  const Icon =
    group.status === "confirmed" ? CheckCircle2 : group.status === "not_confirmed" ? AlertTriangle : Circle;
  const iconColor =
    group.status === "confirmed"
      ? "text-[var(--color-success)]"
      : group.status === "not_confirmed"
        ? "text-[var(--color-warn)]"
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

      {highRiskMeds.map((med) => (
        <HighRiskBanner key={`risk-${med.medicationId}`} name={med.brandName} />
      ))}
      {expiredMeds.map((med) => (
        <div
          key={`expired-${med.medicationId}`}
          className="flex items-start gap-2 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--color-danger)]"
        >
          <CalendarX size={18} className="mt-0.5 shrink-0" />
          {t("home.expiredMedicine", { name: med.brandName })}
        </div>
      ))}
      {expiringMeds.map((med) => (
        <div
          key={`expiring-${med.medicationId}`}
          className="flex items-start gap-2 rounded-[10px] bg-[var(--color-warn-soft)] px-3 py-2 text-sm font-medium text-[var(--color-warn)]"
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          {t("home.expiringMedicine", { name: med.brandName })}
        </div>
      ))}

      {group.status === "confirmed" && (
        <p className="text-sm text-[var(--color-success)]">{t("home.confirmedManual")}</p>
      )}
      {group.status === "not_confirmed" && (
        <div className="flex gap-2">
          <p className="sr-only">{t("home.notConfirmed")}</p>
          <GhostButton className="flex-1 text-sm" onClick={() => onMark(group)}>
            {t("home.markTaken")}
          </GhostButton>
        </div>
      )}
      {group.status === "upcoming" && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("home.ringsAt", {
              name: patientName,
              time: pretty12h(group.time, lang as Language),
            })}
          </p>
          {demoMode && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSimulate(group.time)}
                className="pressable min-h-[48px] rounded-full border border-[var(--color-border)] px-3 text-xs font-medium transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
              >
                {t("call.simTitle", { name: "" }).replace("…", "")}
              </button>
              <button
                type="button"
                onClick={() => onCallNow(group.time)}
                className="pressable flex min-h-[48px] items-center gap-1 rounded-full bg-[var(--color-primary)] px-3 text-xs font-semibold text-white transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
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
