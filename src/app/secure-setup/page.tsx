"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole, ShieldAlert } from "lucide-react";
import { PrimaryButton, Spinner } from "@/components/ui";
import { useAppInfo } from "@/lib/app-info";
import { useI18n } from "@/lib/i18n/provider";

/**
 * A deliberate stop sign for the Supabase rollout. It is better to show a
 * clear setup state than let a signed-in caregiver reach the legacy global
 * D1 data path while tenant records are still being migrated.
 */
export default function SecureSetupPage() {
  const { t } = useI18n();
  const { info, unavailable, refresh } = useAppInfo();

  if (!info && !unavailable) {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-[520px] items-center justify-center bg-[var(--color-bg)] px-5">
        <Spinner label={t("secureSetup.checking")} />
      </main>
    );
  }

  const hasHousehold = info?.hasHousehold ?? false;
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col bg-[var(--color-bg)] px-5 py-8">
      <div className="rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <LockKeyhole size={27} aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-semibold text-[var(--color-primary)]">{t("secureSetup.eyebrow")}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-[var(--color-text)]">
          {t("secureSetup.title")}
        </h1>
        <p className="mt-3 leading-6 text-[var(--color-text-muted)]">
          {t("secureSetup.body")}
        </p>

        <div className="mt-6 space-y-3">
          <StatusRow complete label={t("secureSetup.caregiverAuth")} />
          <StatusRow complete={hasHousehold} label={t("secureSetup.householdOnboarding")} />
          <StatusRow complete={false} label={t("secureSetup.tenantMigration")} />
        </div>

        <div className="mt-6 rounded-[16px] border border-[var(--color-warn)]/20 bg-[var(--color-warn-soft)] p-4">
          <div className="flex gap-3">
            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[var(--color-warn)]" aria-hidden="true" />
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">
              {t("secureSetup.pause")}
            </p>
          </div>
        </div>

        {!hasHousehold ? (
          <Link href="/onboarding" className="mt-6 block">
            <PrimaryButton>{t("secureSetup.setUp")}</PrimaryButton>
          </Link>
        ) : (
          <p className="mt-6 text-sm font-medium text-[var(--color-success)]">
            {t("secureSetup.saved")}
          </p>
        )}

        {unavailable && (
          <button
            type="button"
            onClick={() => void refresh()}
            className="pressable mt-5 min-h-[44px] rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
          >
            {t("secureSetup.retry")}
          </button>
        )}
      </div>
    </main>
  );
}

function StatusRow({ complete, label }: { complete: boolean; label: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-[var(--color-bg)] px-4 py-3">
      <CheckCircle2
        size={20}
        className={complete ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}
        aria-hidden="true"
      />
      <span className={complete ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}>{label}</span>
      <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {complete ? t("secureSetup.ready") : t("secureSetup.pending")}
      </span>
    </div>
  );
}
