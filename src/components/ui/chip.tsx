"use client";

import type { ReactNode } from "react";

export function Chip({
  children,
  selected = false,
  onClick,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      disabled={disabled}
      className={`pressable min-h-[48px] rounded-full border px-4 text-sm font-medium transition-[transform,background-color,border-color,color,opacity] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}
