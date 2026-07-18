"use client";

import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  tone = "surface",
}: {
  children: ReactNode;
  className?: string;
  tone?: "surface" | "danger" | "warn" | "success" | "info" | "unverified";
}) {
  const tones: Record<string, string> = {
    surface: "bg-[var(--color-surface)] border-[var(--color-border)]",
    danger: "bg-[var(--color-danger-soft)] border-[var(--color-danger)]/30",
    warn: "bg-[var(--color-warn-soft)] border-[var(--color-warn)]/30",
    success: "bg-[var(--color-success-soft)] border-[var(--color-success)]/30",
    info: "bg-[var(--color-info-soft)] border-[var(--color-info)]/30",
    unverified: "bg-[var(--color-unverified-soft)] border-[var(--color-unverified)]/30",
  };
  return (
    <div className={`card-shadow rounded-[16px] border p-4 transition-transform duration-150 active:scale-[0.97] ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}
