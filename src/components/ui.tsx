"use client";

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode, type RefObject } from "react";

/** Shared UI primitives (02-DESIGN §3, §6). Elder-first: large targets, high contrast. */

export function PrimaryButton({
  children,
  className = "",
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type={type}
      className={`pressable flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-5 text-base font-semibold text-white transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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
      className={`pressable flex min-h-[48px] items-center justify-center gap-2 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-base font-medium text-[var(--color-text)] transition-[transform,background-color,border-color,opacity] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
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

/**
 * Keyboard-safe modal primitive. It restores focus on close, closes on Escape
 * when requested, and retains Tab focus inside the dialog.
 */
export function ModalDialog({
  title,
  children,
  onClose,
  className = "",
  surfaceClassName = "bg-[var(--color-surface)]",
  titleClassName = "",
  initialFocusRef,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  surfaceClassName?: string;
  titleClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusDialog = () => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const first = dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (initialFocusRef?.current ?? first ?? dialog).focus();
    };
    const frame = window.requestAnimationFrame(focusDialog);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && onCloseRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-shadow max-h-[calc(100dvh_-_2rem)] w-full max-w-[440px] overflow-y-auto rounded-[20px] p-5 ${surfaceClassName} ${className}`}
      >
        <h2 id={titleId} className={`mb-3 text-lg font-bold text-[var(--color-text)] ${titleClassName}`}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
