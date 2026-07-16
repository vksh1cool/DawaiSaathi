"use client";

import { useCallback, useEffect, useState } from "react";

/** Shared timeout lifecycle for small success/error messages. */
export function useTimedMessage(duration = 3_000) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), duration);
    return () => window.clearTimeout(timer);
  }, [duration, message]);

  return {
    message,
    showMessage: useCallback((next: string) => setMessage(next), []),
    clearMessage: useCallback(() => setMessage(null), []),
  };
}
