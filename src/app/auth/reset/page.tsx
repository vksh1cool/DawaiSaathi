"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Field, PrimaryButton, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useSupabaseBrowserClient } from "@/lib/supabase/client";
import { newPasswordSchema } from "@/lib/auth-validation";

/**
 * Second half of the password-reset flow. `/auth/callback` exchanges the
 * emailed link's code for a temporary "recovery" session and lands the
 * caregiver here; `updateUser({ password })` then finalizes the new
 * password against that session.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const supabase = useSupabaseBrowserClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("auth.genericError"));
      return;
    }
    if (!supabase) {
      setError(t("auth.genericError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (updateError) throw updateError;
      setDone(true);
      window.setTimeout(() => window.location.assign("/"), 1200);
    } catch {
      setError(t("auth.resetSessionMissing"));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[460px] flex-col justify-center bg-[var(--color-bg)] px-4 py-[calc(1.5rem_+_env(safe-area-inset-top))]">
      <div className="mb-7 flex items-center gap-3">
        <Image src="/logo.png" alt="" width={48} height={48} className="rounded-[14px]" priority />
        <p className="text-lg font-bold text-[var(--color-primary)]">{t("brand.name")}</p>
      </div>

      {done ? (
        <div className="rounded-[16px] border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/60 p-4" aria-live="polite">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">{t("auth.resetSuccess")}</p>
          </div>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold leading-tight text-[var(--color-text)]">{t("auth.resetTitle")}</h1>
          <p className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">{t("auth.resetBody")}</p>

          <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
            <Field label={t("auth.newPasswordLabel")}>
              <TextInput
                id="new-password"
                name="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
              />
            </Field>
            <Field label={t("auth.confirmPasswordLabel")}>
              <TextInput
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError(null);
                }}
                aria-invalid={!!error}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-[12px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm leading-5 text-[var(--color-danger)]">
                {error}
              </p>
            )}

            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
              {t("auth.resetSubmit")}
              {!submitting && <ArrowRight size={18} />}
            </PrimaryButton>
          </form>

          <Link
            href="/auth"
            className="pressable mt-5 flex min-h-[44px] items-center justify-center text-sm font-semibold text-[var(--color-primary)]"
          >
            {t("auth.backToSignIn")}
          </Link>
        </>
      )}
    </main>
  );
}
