"use client";

import { ReactNode } from "react";

export function Spinner({ label }: { label?: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-[var(--color-text-muted)]" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading...</span>}
    </div>
  );
}
