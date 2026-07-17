"use client";

import Image from "next/image";
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

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg)] px-5 py-8">
      <section className="w-full max-w-[460px] rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
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
        <h1 className="text-3xl font-bold tracking-[-0.03em] text-[var(--color-text)]">{t("auth.title")}</h1>
        <p className="mt-3 max-w-[38ch] leading-6 text-[var(--color-text-muted)]">{t("auth.body")}</p>
        {initialError && (
          <div className="mt-5">
            <Banner tone="warn">
              {t(initialError === "expired_link" ? "auth.expiredLink" : "auth.invalidLink")}
            </Banner>
          </div>
        )}
        <AuthForm nextPath={nextPath} />
      </section>
    </main>
  );
}
