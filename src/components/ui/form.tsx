"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-[48px] w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] ${props.className ?? ""}`}
    />
  );
}
