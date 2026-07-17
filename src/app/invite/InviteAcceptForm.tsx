"use client";

import { useState } from "react";
import { CheckCircle2, UsersRound } from "lucide-react";
import { ApiError, apiJson } from "@/lib/api-client";
import { PrimaryButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export function InviteAcceptForm({ token }: { token: string | null }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      await apiJson("/api/household/invitations/accept", "POST", { token });
      // Remove the credential from the visible URL as soon as it is spent.
      window.history.replaceState({}, "", "/secure-setup");
      window.location.assign("/secure-setup");
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("invite.acceptError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[520px] items-center bg-[var(--color-bg)] px-5 py-8">
      <section className="w-full rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
          <UsersRound size={27} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-[-0.03em] text-[var(--color-text)]">{t("invite.title")}</h1>
        <p className="mt-3 leading-6 text-[var(--color-text-muted)]">
          {t("invite.body")}
        </p>

        {!token ? (
          <p role="alert" className="mt-6 rounded-[14px] bg-[var(--color-danger-soft)] p-4 text-sm leading-5 text-[var(--color-danger)]">
            {t("invite.invalid")}
          </p>
        ) : (
          <>
            <div className="mt-6 flex gap-3 rounded-[14px] bg-[var(--color-bg)] p-4 text-sm leading-5 text-[var(--color-text-muted)]">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--color-success)]" aria-hidden="true" />
              {t("invite.accessNote")}
            </div>
            {error && (
              <p role="alert" className="mt-5 rounded-[12px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm leading-5 text-[var(--color-danger)]">
                {error}
              </p>
            )}
            <PrimaryButton className="mt-6" disabled={loading} onClick={() => void accept()}>
              {loading ? t("invite.joining") : t("invite.join")}
            </PrimaryButton>
          </>
        )}
      </section>
    </main>
  );
}
