"use client";

import { AlertTriangle, Info, HelpCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import type { Severity } from "@/types/domain";

const MAP: Record<
  Severity,
  { color: string; bg: string; icon: typeof AlertTriangle; key: string }
> = {
  major: { color: "var(--color-danger)", bg: "var(--color-danger-soft)", icon: AlertTriangle, key: "safety.sevMajor" },
  moderate: { color: "var(--color-warn)", bg: "var(--color-warn-soft)", icon: AlertTriangle, key: "safety.sevModerate" },
  minor: { color: "var(--color-info)", bg: "var(--color-info-soft)", icon: Info, key: "safety.sevMinor" },
  unverified: { color: "var(--color-unverified)", bg: "var(--color-unverified-soft)", icon: HelpCircle, key: "safety.sevUnverified" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useI18n();
  const s = MAP[severity];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <Icon size={14} />
      {t(s.key)}
    </span>
  );
}
