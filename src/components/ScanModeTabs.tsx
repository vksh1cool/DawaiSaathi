"use client";

import Link from "next/link";
import { Camera, ListChecks } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function ScanModeTabs({ active }: { active: "scan" | "picker" }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex gap-1 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
      <Link
        href="/scan"
        className={`pressable flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors duration-150 ease-[var(--ease-out)] ${
          active === "scan" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"
        }`}
      >
        <Camera size={16} /> {t("scan.modeScanTab")}
      </Link>
      <Link
        href="/scan/picker"
        className={`pressable flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors duration-150 ease-[var(--ease-out)] ${
          active === "picker" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"
        }`}
      >
        <ListChecks size={16} /> {t("scan.modePickerTab")}
      </Link>
    </div>
  );
}
