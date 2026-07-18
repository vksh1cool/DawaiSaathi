"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { ApiError, apiJson } from "@/lib/api-client";
import { PrimaryButton, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

const PHONE_PATTERN = /^\+[1-9][0-9]{6,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

type Method = "phone" | "email";
type Step = "details" | "code" | "emailSent";

export function AuthForm({
  nextPath,
  phoneAuthEnabled,
}: {
  nextPath: string;
  phoneAuthEnabled: boolean;
}) {
  const { t } = useI18n();
  const [method, setMethod] = useState<Method>("email");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  useEffect(() => {
    if (!phoneAuthEnabled && method === "phone") {
      setMethod("email");
      setStep("details");
      setCode("");
      setError(null);
    }
  }, [method, phoneAuthEnabled]);

  const secondsRemaining = resendAt ? Math.max(0, Math.ceil((resendAt - now) / 1000)) : 0;
  const identifier = method === "phone" ? phone.trim() : email.trim().toLowerCase();

  async function sendLinkOrCode() {
    if (method === "phone" && !PHONE_PATTERN.test(identifier)) {
      setError(t("auth.phoneInvalid"));
      return;
    }
    if (method === "email" && !EMAIL_PATTERN.test(identifier)) {
      setError(t("auth.emailInvalid"));
      return;
    }

    setSending(true);
    setError(null);
    try {
      await apiJson("/api/auth/otp/request", "POST", {
        ...(method === "phone" ? { phone: identifier } : { email: identifier }),
        next: nextPath,
      });
      if (method === "phone") {
        setPhone(identifier);
        setCode("");
        setStep("code");
        setResendAt(Date.now() + RESEND_SECONDS * 1000);
        setNow(Date.now());
      } else {
        setEmail(identifier);
        setStep("emailSent");
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("auth.sendError"));
    } finally {
      setSending(false);
    }
  }

  async function verifyCode() {
    if (!/^[0-9A-Za-z]{4,12}$/.test(code.trim())) {
      setError(t("auth.codeInvalid"));
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      await apiJson("/api/auth/otp/verify", "POST", { phone, token: code.trim() });
      window.location.assign(nextPath);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t("auth.verifyError"));
    } finally {
      setVerifying(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "details") void sendLinkOrCode();
    if (step === "code") void verifyCode();
  }

  function changeMethod(next: Method) {
    if (next === "phone" && !phoneAuthEnabled) return;
    setMethod(next);
    setStep("details");
    setCode("");
    setError(null);
  }

  if (step === "emailSent") {
    return (
      <section className="mt-7" aria-live="polite">
        <div className="rounded-[16px] border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/60 p-4">
          <div className="flex items-start gap-3">
            <Mail size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="text-sm leading-5 text-[var(--color-text-muted)]">
              {t("auth.emailSent", { email })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStep("details")}
          className="pressable mt-5 flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)] transition-[transform,color] duration-150 ease-[var(--ease-out)]"
        >
          <ArrowLeft size={18} /> {t("auth.useDifferentContact")}
        </button>
      </section>
    );
  }

  return (
    <form className="mt-7 space-y-5" onSubmit={submit} noValidate>
      {step === "details" && (
        <>
          {phoneAuthEnabled ? (
            <div className="grid grid-cols-2 gap-2 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-1" role="group" aria-label={t("auth.signInMethod")}>
              <button
                type="button"
                aria-pressed={method === "email"}
                onClick={() => changeMethod("email")}
                className={`pressable flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] ${method === "email" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}
              >
                <Mail size={17} /> {t("auth.email")}
              </button>
              <button
                type="button"
                aria-pressed={method === "phone"}
                onClick={() => changeMethod("phone")}
                className={`pressable flex min-h-[44px] items-center justify-center gap-2 rounded-[10px] px-3 text-sm font-semibold transition-[transform,background-color,color] duration-150 ease-[var(--ease-out)] ${method === "phone" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}
              >
                <Smartphone size={17} /> {t("auth.phone")}
              </button>
            </div>
          ) : null}

          <label className="block" htmlFor="caregiver-identifier">
            <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
              {method === "phone" ? t("auth.mobileLabel") : t("auth.emailLabel")}
            </span>
            <TextInput
              id="caregiver-identifier"
              name={method === "phone" ? "phone" : "email"}
              type={method === "phone" ? "tel" : "email"}
              autoComplete={method === "phone" ? "tel" : "email"}
              inputMode={method === "phone" ? "tel" : "email"}
              autoFocus
              value={method === "phone" ? phone : email}
              onChange={(event) => {
                if (method === "phone") setPhone(event.target.value);
                else setEmail(event.target.value);
                setError(null);
              }}
              placeholder={method === "phone" ? "+919876543210" : "you@example.com"}
              aria-invalid={!!error}
              aria-describedby="caregiver-identifier-help"
            />
          </label>
          <p id="caregiver-identifier-help" className="text-sm leading-5 text-[var(--color-text-muted)]">
            {method === "phone"
              ? t("auth.phoneHelp")
              : t("auth.emailHelp")}
          </p>
        </>
      )}

      {step === "code" && (
        <>
          <div className="rounded-[14px] border border-[var(--color-primary)]/20 bg-[var(--color-primary-soft)]/60 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
              <p className="text-sm leading-5 text-[var(--color-text-muted)]">
                {t("auth.codeSent", { phone })}
              </p>
            </div>
          </div>
          <label className="block" htmlFor="caregiver-code">
            <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{t("auth.codeLabel")}</span>
            <TextInput
              id="caregiver-code"
              name="one-time-code"
              autoComplete="one-time-code"
              inputMode="numeric"
              autoFocus
              maxLength={12}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\s/g, ""));
                setError(null);
              }}
              placeholder="123456"
              aria-invalid={!!error}
            />
          </label>
          <button
            type="button"
            disabled={sending || secondsRemaining > 0}
            onClick={() => void sendLinkOrCode()}
            className="pressable min-h-[44px] rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)] transition-[transform,color,opacity] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {secondsRemaining > 0 ? t("auth.resendIn", { seconds: secondsRemaining }) : t("auth.resendCode")}
          </button>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-[12px] bg-[var(--color-danger-soft)] px-4 py-3 text-sm leading-5 text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-1">
        {step === "code" && (
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setCode("");
              setError(null);
            }}
            className="pressable flex min-h-[48px] items-center justify-center rounded-[12px] border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
            >
              <ArrowLeft size={18} /> {t("auth.change")}
          </button>
        )}
        <PrimaryButton type="submit" disabled={sending || verifying} className="flex-1">
          {sending || verifying ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {step === "details"
            ? sending
              ? t("auth.sending")
              : method === "phone"
                ? t("auth.sendCode")
                : t("auth.sendLink")
            : verifying
              ? t("auth.checking")
              : t("common.continue")}
          {!sending && !verifying && <ArrowRight size={18} />}
        </PrimaryButton>
      </div>
    </form>
  );
}
