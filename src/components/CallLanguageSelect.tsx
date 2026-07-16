"use client";

import { Languages } from "lucide-react";
import { CALL_LANGUAGES, callLanguageMeta, type CallLanguage } from "@/lib/languages";

type Props = {
  value: CallLanguage;
  onChange: (language: CallLanguage) => void;
  disabled?: boolean;
  id?: string;
  describedBy?: string;
  className?: string;
  generatedAudioNotice?: string;
};

/**
 * Native select is deliberate: it is familiar to older users, works with
 * screen readers and device translation, and avoids a dense, custom picker.
 * Each option starts in the language people recognise, not English only.
 */
export function CallLanguageSelect({
  value,
  onChange,
  disabled = false,
  id,
  describedBy,
  className = "",
  generatedAudioNotice = "Live phone calls use generated voice audio for this language.",
}: Props) {
  const selected = callLanguageMeta(value);

  return (
    <>
      <div className={`relative flex min-h-[56px] items-center rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 transition-colors focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/15 ${className}`}>
        <Languages size={20} className="mr-2 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value as CallLanguage)}
          className="min-h-[48px] min-w-0 flex-1 appearance-none bg-transparent pr-8 text-left text-base font-semibold text-[var(--color-text)] outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {CALL_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.nativeName} — {language.englishName}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-4 text-sm text-[var(--color-text-muted)]">
          ▾
        </span>
        <span className="sr-only">{selected.region}</span>
      </div>
      {!selected.twilioLocale && (
        <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{generatedAudioNotice}</p>
      )}
    </>
  );
}
