"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { FeedbackModal } from "./FeedbackModal";

/**
 * One consistent, discoverable feedback entry point for both the main app and
 * the first-use flow. It intentionally opens the same privacy-aware modal
 * everywhere instead of offering separate mailto links or data collection.
 */
export function FeedbackLauncher({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("feedback.open")}
        title={t("feedback.open")}
        className={`pressable flex h-12 items-center justify-center gap-1.5 rounded-full text-[var(--color-primary)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] ${
          compact ? "w-12 px-0" : "px-3 max-[420px]:w-12 max-[420px]:px-0"
        } ${className}`}
      >
        <MessageSquare size={20} aria-hidden="true" />
        <span className={`text-sm font-semibold ${compact ? "sr-only" : "max-[420px]:sr-only"}`}>
          {t("feedback.open")}
        </span>
      </button>
      {open && <FeedbackModal onClose={() => setOpen(false)} />}
    </>
  );
}
