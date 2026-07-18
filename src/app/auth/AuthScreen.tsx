"use client";

import Image from "next/image";
import { BellRing, Languages, ShieldCheck, Users } from "lucide-react";
import { useAppInfo } from "@/lib/app-info";
import { useI18n } from "@/lib/i18n/provider";
import { AppLanguageSelect } from "@/components/AppLanguageSelect";
import { Banner } from "@/components/ui";
import { FeedbackLauncher } from "@/components/FeedbackLauncher";
import { AuthForm } from "./AuthForm";

export function AuthScreen({
  nextPath,
  initialError,
}: {
  nextPath: string;
  initialError?: "invalid_link" | "expired_link";
}) {
  const { lang, setLang, t } = useI18n();
  const { info } = useAppInfo();
  const phoneAuthEnabled = info?.phoneAuthEnabled === true;

  return (
    <main className="min-h-[100dvh] bg-[var(--color-bg)] px-4 py-[calc(1rem_+_env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100dvh_-_2rem_-_env(safe-area-inset-top))] w-full max-w-[1080px] items-center gap-8 lg:grid-cols-[1fr_460px]">
        <section className="hidden lg:block" aria-labelledby="auth-product-title">
          <div className="max-w-[560px]">
            <div className="mb-8 flex items-center gap-3">
              <Image src="/logo.png" alt="" width={56} height={56} className="rounded-[16px]" priority />
              <div>
                <p className="text-xl font-bold text-[var(--color-primary)]">{t("brand.name")}</p>
                <p className="text-sm font-medium text-[var(--color-text-muted)]">{t("brand.tagline")}</p>
              </div>
            </div>
            <p className="mb-3 text-sm font-semibold text-[var(--color-primary)]">
              {t("auth.eyebrow")}
            </p>
            <h2 id="auth-product-title" className="max-w-[11ch] text-6xl font-bold leading-[1.02] text-[var(--color-text)]">
              {t("auth.heroTitle")}
            </h2>
            <p className="mt-6 max-w-[48ch] text-lg leading-8 text-[var(--color-text-muted)]">
              {t("auth.heroBody")}
            </p>
            <div className="mt-8 grid max-w-[520px] gap-3">
              {[
                { icon: ShieldCheck, key: "auth.proofPrivacy" },
                { icon: BellRing, key: "auth.proofReminder" },
                { icon: Users, key: "auth.proofCareTeam" },
              ].map(({ icon: Icon, key }) => (
                <div key={key} className="flex min-h-[52px] items-center gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] px-4">
                  <Icon size={20} className="shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                  <span className="text-sm font-medium text-[var(--color-text)]">{t(key)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full justify-self-center rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:max-w-[460px] sm:p-7">
          <div className="mb-7 flex items-center gap-3">
            <Image src="/logo.png" alt="" width={48} height={48} className="rounded-[14px]" priority />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-[var(--color-primary)]">{t("brand.name")}</p>
              <p className="text-sm text-[var(--color-text-muted)]">{t("auth.caregiverAccount")}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <FeedbackLauncher compact />
              <AppLanguageSelect
                compact
                value={lang}
                label={t("auth.appLanguage")}
                onChange={setLang}
              />
            </div>
          </div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)]">
            <Languages size={16} aria-hidden="true" />
            {t("auth.emailFirstBadge")}
          </div>
          <h1 className="text-3xl font-bold leading-tight text-[var(--color-text)]">{t("auth.title")}</h1>
          <p className="mt-3 max-w-[42ch] leading-6 text-[var(--color-text-muted)]">{t("auth.body")}</p>
          {!phoneAuthEnabled && (
            <p className="mt-4 rounded-[12px] bg-[var(--color-info-soft)] px-4 py-3 text-sm font-medium leading-5 text-[var(--color-info)]">
              {t("auth.phoneDisabled")}
            </p>
          )}
          {initialError && (
            <div className="mt-5">
              <Banner tone="warn">
                {t(initialError === "expired_link" ? "auth.expiredLink" : "auth.invalidLink")}
              </Banner>
            </div>
          )}
          <AuthForm nextPath={nextPath} phoneAuthEnabled={phoneAuthEnabled} />
        </section>
      </div>
    </main>
  );
}
