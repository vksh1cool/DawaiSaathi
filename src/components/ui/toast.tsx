"use client";

import type { ReactNode } from "react";

/** A consistent, announced message surface for transient async feedback. */
export function Toast({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "danger" | "warn";
}) {
  const tones = {
    neutral: "bg-[var(--color-text)] text-white",
    success: "bg-[var(--color-success)] text-white",
    danger: "bg-[var(--color-danger)] text-white",
    warn: "bg-[var(--color-warn)] text-white",
  };
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(6.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-40 max-w-[calc(100%_-_2rem)] -translate-x-1/2 rounded-full px-4 py-2 text-center text-sm font-medium shadow-lg ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
