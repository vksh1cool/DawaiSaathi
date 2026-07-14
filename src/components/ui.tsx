"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Shared UI primitives (02-DESIGN §3, §6). Elder-first: large targets, high contrast. */

export function PrimaryButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 text-base font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={`flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-medium text-[var(--color-text)] transition-colors active:bg-[var(--color-bg)] disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  selected = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
      } ${className}`}
    >
      {children}
    </button>
  );
}

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
    <div className={`card-shadow rounded-[16px] border p-4 ${tones[tone]} ${className}`}>
      {children}
    </div>
  );
}

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
  return (
    <div className={`flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-sm font-medium ${map[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-[var(--color-text-muted)]">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-primary)]" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

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

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-[48px] w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] ${props.className ?? ""}`}
    />
  );
}
