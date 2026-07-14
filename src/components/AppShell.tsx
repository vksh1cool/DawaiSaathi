"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, AlertTriangle, IndianRupee, Settings } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import type { ReactNode } from "react";

function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-sm">
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`min-h-[36px] rounded-full px-3 font-medium ${
            lang === l
              ? "bg-[var(--color-primary)] text-white"
              : "text-[var(--color-text-muted)]"
          }`}
          aria-pressed={lang === l}
        >
          {l === "en" ? "EN" : "हि"}
        </button>
      ))}
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
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-2.5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
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
          <Link href="/profile" aria-label={t("profile.title")} className="p-2">
            <Settings size={22} className="text-[var(--color-text-muted)]" />
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pb-40 pt-4">{children}</main>

      {/* Disclaimer (non-dismissible, above tab bar) — PRD §9.1 */}
      <div className="fixed bottom-[56px] left-1/2 z-10 w-full max-w-[480px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-1.5 backdrop-blur">
        <p className="text-[11px] leading-tight text-[var(--color-text-muted)]">
          {t("legal.disclaimer")}
        </p>
      </div>

      {/* Tab bar */}
      <nav className="fixed bottom-0 left-1/2 z-20 flex h-[56px] w-full max-w-[480px] -translate-x-1/2 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 ${
                active ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
              }`}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium">{t(tab.key)}</span>
              {tab.badge === "safety" && safetyBadge ? (
                <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-bold text-white">
                  {safetyBadge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
