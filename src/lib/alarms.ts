const STORAGE_KEY = "dawaisaathi.remindersEnabled";

export function alarmsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!alarmsSupported()) return "unsupported";
  return Notification.permission;
}

export function getRemindersEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

export function setRemindersEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
}

export async function requestRemindersPermission(): Promise<NotificationPermission> {
  if (!alarmsSupported()) return "denied";
  return Notification.requestPermission();
}

// Tier 1: foreground-only. Fires at most once per (tagKey) via the caller's own guard —
// this just no-ops quietly if permission/opt-in aren't both in place.
export function fireDoseAlarm(tagKey: string, title: string, body: string): void {
  if (!alarmsSupported() || Notification.permission !== "granted" || !getRemindersEnabled()) return;
  try {
    new Notification(title, { body, tag: `dawaisaathi-dose-${tagKey}` });
  } catch {
    // Some embedded webviews throw on `new Notification`; the alert is best-effort.
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([200, 100, 200]);
  }
}
