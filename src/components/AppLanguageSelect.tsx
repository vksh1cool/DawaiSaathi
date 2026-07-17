"use client";

import { Languages } from "lucide-react";
import { APP_LANGUAGES, appLanguageMeta, type AppLanguage } from "@/lib/languages";

type Props = {
  value: AppLanguage;
  onChange: (language: AppLanguage) => void;
  disabled?: boolean;
  label: string;
  compact?: boolean;
  className?: string;
};

export function AppLanguageSelect({
  value,
  onChange,
  disabled = false,
  label,
  compact = false,
  className = "",
}: Props) {
  const selected = appLanguageMeta(value);

  return (
    <label
      className={`relative flex items-center rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out)] focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/15 ${
        compact ? "min-h-[44px] px-2" : "min-h-[52px] w-full px-3"
      } ${className}`}
    >
      <span className="sr-only">{label}</span>
      <Languages
        size={compact ? 17 : 19}
        className="mr-2 shrink-0 text-[var(--color-primary)]"
        aria-hidden="true"
      />
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as AppLanguage)}
        aria-label={label}
        className={`min-h-[44px] min-w-0 appearance-none bg-transparent text-left font-semibold text-[var(--color-text)] outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? "w-[4.25rem] pr-5 text-sm" : "w-full pr-8 text-base"
        }`}
      >
        {APP_LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {compact ? language.shortLabel : `${language.nativeName} - ${language.englishName}`}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute text-sm text-[var(--color-text-muted)] ${compact ? "right-2" : "right-4"}`}
      >
        ▾
      </span>
      <span className="sr-only">{selected.englishName}</span>
    </label>
  );
}
