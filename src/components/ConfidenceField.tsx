"use client";

import { AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

const THRESHOLD = 0.7;

/** Labeled input that visually flags low-confidence extraction (AC-1.3). */
export function ConfidenceField({
  label,
  value,
  confidence,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  min,
  step,
}: {
  label: string;
  value: string;
  confidence?: number;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
  placeholder?: string;
  min?: number;
  step?: number | string;
}) {
  const { t } = useI18n();
  const unclear = confidence !== undefined && confidence < THRESHOLD;
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`min-h-[44px] w-full rounded-[10px] border bg-[var(--color-surface)] px-3 text-base outline-none focus:border-[var(--color-primary)] ${
          unclear ? "border-[var(--color-warn)]" : "border-[var(--color-border)]"
        }`}
      />
      {unclear && (
        <span className="mt-1 flex items-center gap-1 text-xs text-[var(--color-warn)]">
          <AlertCircle size={12} />
          {t("review.unclear", { field: label })}
        </span>
      )}
    </label>
  );
}
