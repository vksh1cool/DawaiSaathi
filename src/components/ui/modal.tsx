"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

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
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = "hidden";

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
      document.body.style.overflow = originalStyle;
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && onCloseRef.current) {
      onCloseRef.current();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center" 
      role="presentation"
      onClick={handleBackdropClick}
    >
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
