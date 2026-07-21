"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle, Mail, Sparkles } from "lucide-react";
import { ApiError, apiJson } from "@/lib/api-client";
import { Field, GhostButton, PrimaryButton, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useSupabaseBrowserClient } from "@/lib/supabase/client";
import { seedDemoHousehold } from "@/lib/demo-seed";
import { loginSchema, resetRequestSchema, signUpSchema } from "@/lib/auth-validation";

type View = "signIn" | "signUp" | "forgot";

export function AuthForm({ nextPath }: { nextPath: string }) {
  const { t, lang } = useI18n();
  const supabase = useSupabaseBrowserClient();

  const [view, setView] = useState<View>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [resetSentFor, setResetSentFor] = useState<string | null>(null);

  function changeView(next: View) {
    setView(next);
    setError(null);
  }

  async function submitSignIn() {
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("auth.genericError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiJson("/api/auth/login", "POST", parsed.data);
      window.location.assign(nextPath);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("auth.genericError"));
      setSubmitting(false);
    }
  }

  async function submitSignUp() {
    const parsed = signUpSchema.safeParse({ email, password, next: nextPath });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("auth.genericError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiJson<{ ok: boolean; confirmationRequired: boolean }>(
        "/api/auth/signup",
        "POST",
        parsed.data,
      );
      if (result.confirmationRequired) {
        setConfirmationEmail(parsed.data.email);
        setSubmitting(false);
      } else {
        window.location.assign(nextPath);
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("auth.genericError"));
      setSubmitting(false);
    }
  }

  async function submitForgot() {
    const parsed = resetRequestSchema.safeParse({ email, next: nextPath });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("auth.genericError"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiJson("/api/auth/reset/request", "POST", parsed.data);
      setResetSentFor(parsed.data.email);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("auth.genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (view === "signIn") void submitSignIn();
    else if (view === "signUp") void submitSignUp();
    else void submitForgot();
  }

  async function continueWithGoogle() {
    if (!supabase) return;
    setGoogleLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    });
    if (oauthError) {
      setError(t("auth.googleError"));
      setGoogleLoading(false);
    }
    // On success the browser is already navigating to Google; nothing else to do here.
  }

  async function tryDemo() {
    if (!supabase) return;
    setDemoLoading(true);
    setError(null);
    try {
      const { error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      await seedDemoHousehold(lang);
      window.location.assign(nextPath);
    } catch {
      setError(t("auth.demoError"));
      setDemoLoading(false);
    }
  }

  const busy = submitting || googleLoading || demoLoading;

  if (resetSentFor) {
    return (
      <section className="mt-7" aria-live="polite">
        <div className="rounded-[16px] border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/60 p-4">
          <div className="flex items-start gap-3">
            <Mail size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">{t("auth.resetSent", { email: resetSentFor })}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setResetSentFor(null);
            changeView("signIn");
          }}
          className="pressable mt-5 flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
        >
          {t("auth.backToSignIn")}
        </button>
      </section>
    );
  }

  if (confirmationEmail) {
    return (
      <section className="mt-7" aria-live="polite">
        <div className="rounded-[16px] border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/60 p-4">
          <div className="flex items-start gap-3">
            <Mail size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">{t("auth.confirmEmailSent", { email: confirmationEmail })}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmationEmail(null);
            changeView("signIn");
          }}
          className="pressable mt-5 flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
        >
          {t("auth.backToSignIn")}
        </button>
      </section>
    );
  }

  return (
    <div className="mt-7">
      {view !== "forgot" && (
        <div
          className="grid grid-cols-2 gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1"
          role="group"
          aria-label={t("auth.modeSwitch")}
        >
          <button
            type="button"
            aria-pressed={view === "signIn"}
            onClick={() => changeView("signIn")}
            className={`pressable flex min-h-[44px] items-center justify-center rounded-[10px] px-3 text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] ${view === "signIn" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}
          >
            {t("auth.signIn")}
          </button>
          <button
            type="button"
            aria-pressed={view === "signUp"}
            onClick={() => changeView("signUp")}
            className={`pressable flex min-h-[44px] items-center justify-center rounded-[10px] px-3 text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] ${view === "signUp" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}
          >
            {t("auth.signUp")}
          </button>
        </div>
      )}

      <form className="mt-5 space-y-5" onSubmit={submit} noValidate>
        <Field label={t("auth.emailLabel")}>
          <TextInput
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setError(null);
            }}
            placeholder="you@example.com"
            aria-invalid={!!error}
          />
        </Field>

        {view !== "forgot" && (
          <Field label={t("auth.passwordLabel")}>
            <TextInput
              id="auth-password"
              name="password"
              type="password"
              autoComplete={view === "signUp" ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              aria-invalid={!!error}
            />
          </Field>
        )}

        {view === "signIn" && (
          <button
            type="button"
            onClick={() => changeView("forgot")}
            className="pressable -mt-2 flex min-h-[36px] items-center text-sm font-semibold text-[var(--color-primary)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
          >
            {t("auth.forgotPassword")}
          </button>
        )}

        {error && (
          <p role="alert" className="rounded-[12px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm leading-5 text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <PrimaryButton type="submit" disabled={busy}>
          {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {view === "signIn" ? t("auth.signIn") : view === "signUp" ? t("auth.signUp") : t("auth.sendResetLink")}
          {!submitting && <ArrowRight size={18} />}
        </PrimaryButton>

        {view === "forgot" && (
          <button
            type="button"
            onClick={() => changeView("signIn")}
            className="pressable flex min-h-[44px] w-full items-center justify-center text-sm font-semibold text-[var(--color-text-muted)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
          >
            {t("auth.backToSignIn")}
          </button>
        )}
      </form>

      {view !== "forgot" && (
        <>
          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <div className="h-px flex-1 bg-[var(--color-border)]" />
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{t("auth.orDivider")}</span>
            <div className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <GhostButton type="button" onClick={() => void continueWithGoogle()} disabled={busy || !supabase} className="w-full">
            {googleLoading ? <LoaderCircle size={18} className="animate-spin" /> : <GoogleIcon />}
            {t("auth.continueWithGoogle")}
          </GhostButton>

          <GhostButton
            type="button"
            onClick={() => void tryDemo()}
            disabled={busy || !supabase}
            className="mt-3 w-full border-0 bg-[var(--color-primary-soft)] text-[var(--color-primary)]"
          >
            {demoLoading ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {t("auth.tryDemo")}
          </GhostButton>
        </>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03l2.97-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97l2.97 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
    </svg>
  );
}
