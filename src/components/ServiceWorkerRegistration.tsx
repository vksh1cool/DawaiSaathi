"use client";

import { useEffect } from "react";

/**
 * The worker intentionally caches only the offline document. Health records,
 * session-bound pages, photos, audio, and APIs never enter a shared cache.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Offline enhancement is non-critical; the app stays usable online.
    });
  }, []);

  return null;
}
