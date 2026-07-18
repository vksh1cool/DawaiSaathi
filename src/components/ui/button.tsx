"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`pressable flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 text-base font-semibold text-white transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`pressable flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-medium text-[var(--color-text)] transition-[transform,background-color,border-color,opacity] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-bg)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
