"use client";

import type { ReactNode } from "react";

export function Banner({
  children,
  tone,
  icon,
}: {
  children: ReactNode;
  tone: "danger" | "warn" | "success" | "info";
  icon?: ReactNode;
}) {
  const map = {
    danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
    warn: "bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
    success: "bg-[var(--color-success-soft)] text-[var(--color-success)]",
    info: "bg-[var(--color-info-soft)] text-[var(--color-info)]",
  };
  // Safety-critical banners (drug interactions, high-risk meds) must be
  // announced to screen readers; role="alert" is assertive, "status" polite.
  const role = tone === "danger" || tone === "warn" ? "alert" : "status";
  return (
    <div role={role} className={`flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-sm font-medium ${map[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
