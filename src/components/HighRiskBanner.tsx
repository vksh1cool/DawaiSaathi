"use client";

import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function HighRiskBanner({ name }: { name: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start gap-2 rounded-[12px] bg-[var(--color-danger-soft)] px-3 py-2.5">
      <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
      <div>
        <p className="text-sm font-bold text-[var(--color-danger)]">{t("review.highRisk")}</p>
        <p className="text-sm text-[var(--color-danger)]">{t("review.highRiskBody", { name })}</p>
      </div>
    </div>
  );
}
