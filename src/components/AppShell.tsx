"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, AlertTriangle, IndianRupee, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiJson } from "@/lib/api-client";
import { useTimedMessage } from "@/lib/use-timed-message";
import { Toast } from "@/components/ui";
import { useState } from "react";
import type { ReactNode } from "react";

function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const { info } = useAppInfo();
  const [syncing, setSyncing] = useState(false);
  const { message, showMessage } = useTimedMessage();

  const changeLanguage = async (next: "en" | "hi") => {
    if (next === lang || syncing) return;
    const previous = lang;
    setLang(next);
    if (!info?.hasHousehold) return;
    setSyncing(true);
    try {
      await apiJson("/api/household", "PATCH", { uiLanguage: next });
    } catch {
      // Do not leave a local setting that disagrees with the saved profile;
      // that becomes confusing as soon as the household is opened elsewhere.
      setLang(previous);
      showMessage(t("profile.saveError"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-sm">
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => void changeLanguage(l)}
          disabled={syncing}
          className={`pressable min-h-[44px] rounded-full px-3 font-medium transition-[transform,background-color,color,opacity] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-50 ${
            lang === l
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-text-muted)]"
          }`}
          aria-pressed={lang === l}
        >
          {l === "en" ? "EN" : "हि"}
        </button>
      ))}
      {message && <Toast tone="warn">{message}</Toast>}
    </div>
  );
}

const TABS = [
  { href: "/", icon: Home, key: "nav.home", badge: null },
  { href: "/scan", icon: Camera, key: "nav.scan", badge: null },
  { href: "/safety", icon: AlertTriangle, key: "nav.safety", badge: "safety" as const },
  { href: "/savings", icon: IndianRupee, key: "nav.savings", badge: null },
];

export function AppShell({
  children,
  safetyBadge,
}: {
  children: ReactNode;
  safetyBadge?: number;
}) {
  const { t } = useI18n();
  const { info } = useAppInfo();
  const pathname = usePathname();

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-[var(--color-bg)]">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-[60] rounded-[10px] bg-[var(--color-primary)] px-4 py-3 font-semibold text-white focus:not-sr-only"
      >
        {t("common.skipToContent")}
      </a>
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 pb-2.5 pt-[calc(0.625rem_+_env(safe-area-inset-top))] backdrop-blur">
        <Link href="/" className="pressable flex min-h-[44px] items-center gap-2 rounded-[10px]">
          <Image src="/logo.png" alt="DawaiSaathi" width={32} height={32} className="rounded-md" />
          <span className="text-lg font-bold text-[var(--color-primary)]">{t("brand.name")}</span>
          {info?.demoMode && (
            <span className="rounded-full bg-[var(--color-warn-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-warn)]">
              {t("common.demo")}
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            href="/profile"
            aria-label={t("profile.title")}
            className="pressable flex h-12 w-12 items-center justify-center rounded-full transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
          >
            <Settings size={22} className="text-[var(--color-text-muted)]" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main id="main-content" className="flex-1 px-4 pb-[calc(9rem_+_env(safe-area-inset-bottom))] pt-4">{children}</main>

      {/* Disclaimer (non-dismissible, above tab bar) — PRD §9.1 */}
      <div className="fixed bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-10 w-full max-w-[480px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-1.5 backdrop-blur">
        <p className="text-[11px] leading-tight text-[var(--color-text-muted)]">
          {t("legal.disclaimer")}
        </p>
      </div>

      {/* Tab bar */}
      <nav
        aria-label={t("nav.primary")}
        className="fixed bottom-0 left-1/2 z-20 flex h-[calc(3.5rem_+_env(safe-area-inset-bottom))] w-full max-w-[480px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              aria-label={tab.badge === "safety" && safetyBadge ? `${t(tab.key)} (${safetyBadge})` : undefined}
              className={`pressable relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-[transform,color] duration-150 ease-[var(--ease-out)] ${
                active ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium">{t(tab.key)}</span>
              {tab.badge === "safety" && safetyBadge ? (
                <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
                  {safetyBadge > 9 ? "9+" : safetyBadge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
