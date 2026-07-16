"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Stethoscope, Check } from "lucide-react";
import { Card } from "@/components/ui";
import { SeverityBadge } from "@/components/SeverityBadge";
import { useI18n } from "@/lib/i18n/provider";
import type { Finding } from "@/types/domain";

const toneFor = (s: Finding["severity"]) =>
  s === "major" ? "danger" : s === "moderate" ? "warn" : s === "unverified" ? "unverified" : "info";

export function FindingCard({
  finding,
  onAcknowledge,
  acknowledging = false,
}: {
  finding: Finding;
  onAcknowledge?: (id: string) => void | Promise<void>;
  acknowledging?: boolean;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const evidenceId = useId();
  const explanation = lang === "hi" ? finding.explanationHi : finding.explanationEn;
  const action = lang === "hi" ? finding.actionHi : finding.actionEn;

  return (
    <Card tone={toneFor(finding.severity)} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SeverityBadge severity={finding.severity} />
      </div>

      <p className="text-base font-semibold text-[var(--color-text)]">
        {finding.brandA} <span className="text-[var(--color-text-muted)]">({finding.saltA})</span>
        {" + "}
        {finding.brandB} <span className="text-[var(--color-text-muted)]">({finding.saltB})</span>
      </p>

      <p className="text-sm text-[var(--color-text)]">{explanation}</p>

      {finding.severity === "unverified" && (
        <p className="text-xs italic text-[var(--color-unverified)]">{t("safety.unverified_note")}</p>
      )}

      {finding.evidence.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={evidenceId}
            className="pressable flex min-h-[44px] items-center gap-1 rounded-[10px] px-2 text-sm font-medium text-[var(--color-primary)] transition-transform duration-150 ease-[var(--ease-out)]"
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {t("safety.whyFlagged")}
          </button>
          {open && (
            <div id={evidenceId} className="mt-2 flex flex-col gap-2">
              {finding.evidence.map((e, i) => (
                <div key={i} className="rounded-[10px] bg-black/5 p-2.5">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-[var(--color-text-muted)]">
                    {t("safety.source")}: {e.source}
                  </p>
                  <p className="text-sm italic text-[var(--color-text)]">&ldquo;{e.quote}&rdquo;</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
        <Stethoscope size={16} className="shrink-0" />
        {action}
      </p>

      {!finding.acknowledged && onAcknowledge && (
        <button
          type="button"
          onClick={() => void onAcknowledge(finding.id)}
          disabled={acknowledging}
          className="pressable mt-1 flex min-h-[44px] items-center gap-1 self-start rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check size={14} /> {t("safety.markDiscussed")}
        </button>
      )}
    </Card>
  );
}
