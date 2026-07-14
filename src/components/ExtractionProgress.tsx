"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Sequential progress checklist shown while /api/scan runs. The API call is
 * synchronous, so phases advance on a timer as a good-faith approximation.
 */
export function ExtractionProgress() {
  const { t } = useI18n();
  const phases = [t("scan.phaseReading"), t("scan.phaseSalts"), t("scan.phaseDetails")];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setActive(1), 7000),
      setTimeout(() => setActive(2), 15000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col gap-3 py-6">
      {phases.map((label, i) => (
        <div key={i} className="flex items-center gap-3">
          {i < active ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)]">
              <Check size={16} />
            </span>
          ) : i === active ? (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <Loader2 size={16} className="animate-spin" />
            </span>
          ) : (
            <span className="h-7 w-7 rounded-full border border-[var(--color-border)]" />
          )}
          <span
            className={
              i <= active ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
            }
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
