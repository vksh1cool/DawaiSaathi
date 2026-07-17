"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  Play,
  ShieldCheck,
  Smartphone,
  User,
  Users,
  Volume2,
} from "lucide-react";
import { PrimaryButton, GhostButton, Field, TextInput, Banner } from "@/components/ui";
import { CallLanguageSelect } from "@/components/CallLanguageSelect";
import { AppLanguageSelect } from "@/components/AppLanguageSelect";
import { FeedbackLauncher } from "@/components/FeedbackLauncher";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiJson, ApiError } from "@/lib/api-client";
import {
  DIALING_REGIONS,
  dialingRegion,
  phoneInputFromValue,
  phoneToE164,
  isValidPhoneInput,
  type DialingRegionCode,
} from "@/lib/onboarding";
import { isSmsReminderLanguage, speechLocale, type CallLanguage } from "@/lib/languages";
import { voiceSampleScript } from "@/lib/voice-samples";

type VoiceGender = "female" | "male";

export default function OnboardingPage() {
  const { t, lang, setLang } = useI18n();
  const { refresh } = useAppInfo();

  const [step, setStep] = useState(0);
  const [caregiverName, setCaregiverName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [phoneRegion, setPhoneRegion] = useState<DialingRegionCode>("IN");
  const [self, setSelf] = useState(false);
  const [callLang, setCallLang] = useState<CallLanguage>("hi");
  const [voice, setVoice] = useState<VoiceGender>("female");
  const [smsReminderConsent, setSmsReminderConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRequestRef = useRef(0);
  // A repeated POST after a flaky mobile connection must resolve to the same
  // household when the Supabase tenant path is enabled, not create a duplicate.
  const onboardingIdempotencyKeyRef = useRef<string | null>(null);

  const patientDisplayName = self ? caregiverName.trim() : patientName.trim();
  const mobileValid = isValidPhoneInput(mobileNumber, phoneRegion);
  const selectedPhoneRegion = dialingRegion(phoneRegion);
  const smsLanguageSupported = isSmsReminderLanguage(callLang);

  const stopPreview = () => {
    previewRequestRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setPreviewing(false);
  };

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const playDevicePreview = (requestId: number, language: CallLanguage, name: string) => {
    if (requestId !== previewRequestRef.current) return;
    if (!("speechSynthesis" in window)) {
      setPreviewing(false);
      setVoiceStatus(t("onboarding.previewUnavailable"));
      return;
    }

    const utterance = new SpeechSynthesisUtterance(voiceSampleScript(language, name));
    utterance.lang = speechLocale(language);
    utterance.rate = 0.88;
    utterance.onend = () => {
      if (requestId === previewRequestRef.current) setPreviewing(false);
    };
    utterance.onerror = () => {
      if (requestId !== previewRequestRef.current) return;
      setPreviewing(false);
      setVoiceStatus(t("onboarding.previewUnavailable"));
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setVoiceStatus(t("onboarding.previewDevice"));
  };

  const previewVoice = async () => {
    stopPreview();
    const requestId = previewRequestRef.current;
    const selectedLanguage = callLang;
    const selectedName = patientDisplayName;
    setPreviewing(true);
    setVoiceStatus(null);

    try {
      const res = await apiJson<{ audioUrl: string }>("/api/tts/sample", "POST", {
        language: selectedLanguage,
        voiceGender: voice,
        name: selectedName,
      });
      if (requestId !== previewRequestRef.current) return;
      const audio = new Audio(res.audioUrl);
      let usingFallback = false;
      const useFallback = () => {
        if (usingFallback) return;
        usingFallback = true;
        if (audioRef.current === audio) audioRef.current = null;
        playDevicePreview(requestId, selectedLanguage, selectedName);
      };

      audioRef.current = audio;
      audio.onended = () => {
        if (requestId !== previewRequestRef.current) return;
        if (audioRef.current === audio) audioRef.current = null;
        setPreviewing(false);
      };
      audio.onerror = useFallback;
      await audio.play();
      if (requestId !== previewRequestRef.current) return;
      setVoiceStatus(t("onboarding.previewPlaying"));
    } catch {
      playDevicePreview(requestId, selectedLanguage, selectedName);
    }
  };

  const moveTo = (nextStep: number) => {
    stopPreview();
    setError(null);
    setVoiceStatus(null);
    setStep(nextStep);
  };

  const validateFirstStep = () => {
    if (caregiverName.trim()) return true;
    setError(t("onboarding.nameRequired"));
    return false;
  };

  const validatePatientStep = () => {
    if (!self && !patientName.trim()) {
      setError(t("onboarding.patientRequired"));
      return false;
    }
    if (!mobileValid) {
      setError(t("onboarding.phoneInvalid"));
      return false;
    }
    return true;
  };

  const finish = async () => {
    if (!validateFirstStep()) {
      setStep(0);
      return;
    }
    if (!validatePatientStep()) {
      setStep(1);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      onboardingIdempotencyKeyRef.current ??= crypto.randomUUID();
      await apiJson("/api/household", "POST", {
        caregiverName: caregiverName.trim(),
        uiLanguage: lang,
        patient: {
          name: patientDisplayName,
          phoneE164: phoneToE164(mobileNumber, phoneRegion),
          language: callLang,
          voiceGender: voice,
          smsReminderConsent,
        },
      }, {
        headers: { "Idempotency-Key": onboardingIdempotencyKeyRef.current },
      });

      await leaveOnboarding();
    } catch (e) {
      if (e instanceof ApiError && e.code === "CONFLICT") {
        // A completed setup is safer to preserve than to overwrite. This also
        // recovers cleanly if the user returns to an old onboarding tab.
        await leaveOnboarding();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("onboarding.finishError"));
      setSaving(false);
    }
  };

  const leaveOnboarding = async () => {
    // Do not navigate against stale app-info. Supabase's staged tenant
    // rollout deliberately lands on the secure-status screen rather than
    // flashing the blocked legacy workspace after a successful setup.
    const appInfo = await refresh();
    const destination =
      appInfo?.authMode === "supabase" && !appInfo.tenantRuntimeReady
        ? "/secure-setup"
        : "/";
    window.location.replace(destination);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step === 0 && validateFirstStep()) moveTo(1);
    if (step === 1 && validatePatientStep()) moveTo(2);
    if (step === 2) void finish();
  };

  const updateMobile = (value: string) => {
    setMobileNumber(phoneInputFromValue(value, phoneRegion));
    setError(null);
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[520px] flex-col bg-[var(--color-bg)] px-5 pb-[calc(1.5rem_+_env(safe-area-inset-bottom))] pt-[calc(1.25rem_+_env(safe-area-inset-top))] sm:px-6">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-[var(--color-text-muted)]">
            {t("onboarding.stepProgress", { current: step + 1, total: 3 })}
          </p>
          <ol className="flex gap-1.5" aria-label={t("onboarding.progressLabel")}>
            {[0, 1, 2].map((index) => (
              <li
                key={index}
                className={`h-1.5 rounded-full transition-colors duration-200 ease-[var(--ease-out)] ${
                  index === step
                    ? "w-10 bg-[var(--color-primary)]"
                    : index < step
                      ? "w-5 bg-[var(--color-primary)]/55"
                      : "w-5 bg-[var(--color-border)]"
                }`}
              >
                <span className="sr-only">
                  {t("onboarding.stepProgress", { current: index + 1, total: 3 })}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex items-center gap-1.5">
          <FeedbackLauncher compact />
          <AppLanguageSelect
            compact
            value={lang}
            label={t("onboarding.appLanguage")}
            onChange={(language) => {
              setLang(language);
              setError(null);
            }}
          />
        </div>
      </header>

      <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit} noValidate>
        {step === 0 && (
          <section key="welcome" className="onboarding-step flex flex-1 flex-col">
            <div className="mb-7">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[var(--color-primary-soft)] p-2">
                <Image src="/logo.png" alt="DawaiSaathi" width={64} height={64} className="rounded-[18px]" priority />
              </div>
              <p className="mb-2 text-sm font-semibold text-[var(--color-primary)]">{t("onboarding.welcomeEyebrow")}</p>
              <h1 className="max-w-[18ch] text-3xl font-bold tracking-[-0.03em] text-[var(--color-text)]">
                {t("onboarding.welcomeTitle")}
              </h1>
              <p className="mt-3 max-w-[38ch] leading-6 text-[var(--color-text-muted)]">{t("onboarding.welcomeBody")}</p>
            </div>

            <Field label={t("onboarding.yourName")}>
              <TextInput
                autoFocus
                autoComplete="name"
                value={caregiverName}
                onChange={(event) => {
                  setCaregiverName(event.target.value);
                  setError(null);
                }}
                placeholder={t("onboarding.yourNamePlaceholder")}
                aria-invalid={!!error && !caregiverName.trim()}
              />
            </Field>

            <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-[var(--color-primary)]/15 bg-[var(--color-primary-soft)]/50 p-4 text-sm text-[var(--color-text-muted)]">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
              <p>{t("onboarding.privacyNote")}</p>
            </div>

            <OnboardingFooter error={error}>
              <PrimaryButton type="submit">
                {t("common.continue")} <ArrowRight size={18} />
              </PrimaryButton>
            </OnboardingFooter>
          </section>
        )}

        {step === 1 && (
          <section key="patient" className="onboarding-step flex flex-1 flex-col">
            <div className="mb-7">
              <p className="mb-2 text-sm font-semibold text-[var(--color-primary)]">{t("onboarding.patientEyebrow")}</p>
              <h1 className="text-3xl font-bold tracking-[-0.03em]">{t("onboarding.patientTitle")}</h1>
              <p className="mt-3 max-w-[38ch] leading-6 text-[var(--color-text-muted)]">{t("onboarding.patientBody")}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label={t("onboarding.patientTitle")}>
              <button
                type="button"
                aria-pressed={self}
                onClick={() => {
                  setSelf(true);
                  setError(null);
                }}
                className={`pressable flex min-h-[104px] flex-col items-start rounded-[18px] border p-4 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
                  self
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
              >
                <div className="mb-2 flex w-full items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-primary)]">
                    <User size={18} aria-hidden="true" />
                  </span>
                  {self && <CheckCircle2 size={20} className="text-[var(--color-primary)]" aria-hidden="true" />}
                </div>
                <span className="font-semibold">{t("onboarding.selfCare")}</span>
              </button>

              <button
                type="button"
                aria-pressed={!self}
                onClick={() => {
                  setSelf(false);
                  setError(null);
                }}
                className={`pressable flex min-h-[104px] flex-col items-start rounded-[18px] border p-4 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
                  !self
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]"
                }`}
              >
                <div className="mb-2 flex w-full items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-primary)]">
                    <Users size={18} aria-hidden="true" />
                  </span>
                  {!self && <CheckCircle2 size={20} className="text-[var(--color-primary)]" aria-hidden="true" />}
                </div>
                <span className="font-semibold">{t("onboarding.careForSomeone")}</span>
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-5">
              {!self && (
                <Field label={t("onboarding.patientName")}>
                  <TextInput
                    autoFocus
                    autoComplete="name"
                    value={patientName}
                    onChange={(event) => {
                      setPatientName(event.target.value);
                      setError(null);
                    }}
                    placeholder={t("onboarding.patientNamePlaceholder")}
                    aria-invalid={!!error && !patientName.trim()}
                  />
                </Field>
              )}

              <Field label={t("onboarding.patientPhone")}>
                <div className={`flex min-h-[52px] overflow-hidden rounded-[12px] border bg-[var(--color-surface)] transition-colors ${error && !mobileValid ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus-within:border-[var(--color-primary)]"}`}>
                  <label className="flex items-center border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2" aria-label={t("onboarding.phoneCountry")}>
                    <Smartphone size={17} className="mr-1 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                    <select
                      value={phoneRegion}
                      onChange={(event) => {
                        const next = event.target.value as DialingRegionCode;
                        setPhoneRegion(next);
                        setMobileNumber((current) => phoneInputFromValue(current, next));
                        setError(null);
                      }}
                      className="min-h-[48px] max-w-[112px] bg-transparent pr-1 text-sm font-semibold text-[var(--color-text)] outline-none"
                    >
                      {DIALING_REGIONS.map((region) => (
                        <option key={region.code} value={region.code}>
                          {region.dialCode ? `${region.name} +${region.dialCode}` : region.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    value={mobileNumber}
                    onChange={(event) => updateMobile(event.target.value)}
                    placeholder={selectedPhoneRegion.example}
                    className="min-w-0 flex-1 bg-transparent px-3 text-base tracking-[0.04em] text-[var(--color-text)] outline-none placeholder:tracking-normal placeholder:text-[var(--color-text-muted)]"
                    aria-describedby="phone-help"
                    aria-invalid={!!error && !mobileValid}
                  />
                </div>
                <p id="phone-help" className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">
                  {t("onboarding.phoneHelp")}
                </p>
              </Field>
            </div>

            <OnboardingFooter error={error}>
              <GhostButton type="button" onClick={() => moveTo(0)} className="w-[104px] shrink-0">
                <ArrowLeft size={18} /> {t("common.back")}
              </GhostButton>
              <PrimaryButton type="submit" className="flex-1">
                {t("common.continue")} <ArrowRight size={18} />
              </PrimaryButton>
            </OnboardingFooter>
          </section>
        )}

        {step === 2 && (
          <section key="voice" className="onboarding-step flex flex-1 flex-col">
            <div className="mb-7">
              <p className="mb-2 text-sm font-semibold text-[var(--color-primary)]">{t("onboarding.voiceEyebrow")}</p>
              <h1 className="text-3xl font-bold tracking-[-0.03em]">
                {t("onboarding.langTitle", { name: patientDisplayName })}
              </h1>
              <p className="mt-3 max-w-[38ch] leading-6 text-[var(--color-text-muted)]">{t("onboarding.voiceBody")}</p>
            </div>

            <div>
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{t("onboarding.callLanguage")}</span>
              <CallLanguageSelect
                value={callLang}
                onChange={(language) => {
                  stopPreview();
                  setCallLang(language);
                  if (!isSmsReminderLanguage(language)) setSmsReminderConsent(false);
                  setVoiceStatus(null);
                }}
                describedBy="call-language-help"
                generatedAudioNotice={t("onboarding.generatedVoiceRequirement")}
              />
              <p id="call-language-help" className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">
                {t("onboarding.callLanguageHelp")}
              </p>
            </div>

            <div className="mt-6">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
                <Volume2 size={17} className="text-[var(--color-primary)]" aria-hidden="true" /> {t("onboarding.voice")}
              </span>
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("onboarding.voice")}>
                {(["female", "male"] as const).map((gender) => {
                  const selected = voice === gender;
                  return (
                    <button
                      key={gender}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        stopPreview();
                        setVoice(gender);
                        setVoiceStatus(null);
                      }}
                      className={`pressable flex min-h-[74px] items-center justify-between rounded-[16px] border px-4 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
                        selected
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60 text-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                      }`}
                    >
                      <span className="font-semibold">
                        {gender === "female" ? t("onboarding.voiceFemale") : t("onboarding.voiceMale")}
                      </span>
                      {selected && <CheckCircle2 size={20} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <GhostButton type="button" onClick={() => void previewVoice()} disabled={previewing} className="w-full border-0 bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                {previewing ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                {previewing ? t("onboarding.previewLoading") : t("onboarding.previewVoice")}
              </GhostButton>
              <p className="mt-2 min-h-5 px-1 text-sm leading-5 text-[var(--color-text-muted)]" role="status" aria-live="polite">
                {voiceStatus ?? t("onboarding.previewHelp")}
              </p>
            </div>

            <label className="mt-4 flex min-h-[64px] cursor-pointer items-start gap-3 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-5 text-[var(--color-text)]">
              <input
                type="checkbox"
                checked={smsReminderConsent}
                disabled={!smsLanguageSupported}
                onChange={(event) => setSmsReminderConsent(event.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)] disabled:opacity-40"
              />
              <span>
                <span className="block font-semibold">{t("onboarding.smsConsentTitle")}</span>
                <span className="mt-1 block text-[var(--color-text-muted)]">
                  {smsLanguageSupported
                    ? t("onboarding.smsConsentBody")
                    : t("onboarding.smsLanguagePending")}
                </span>
              </span>
            </label>

            <OnboardingFooter error={error}>
              <GhostButton type="button" onClick={() => moveTo(1)} className="w-[104px] shrink-0" disabled={saving}>
                <ArrowLeft size={18} /> {t("common.back")}
              </GhostButton>
              <PrimaryButton type="submit" className="flex-1" disabled={saving} aria-busy={saving}>
                {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} />}
                {saving ? t("onboarding.finishing") : t("onboarding.finish")}
              </PrimaryButton>
            </OnboardingFooter>
          </section>
        )}
      </form>
    </main>
  );
}

function OnboardingFooter({ children, error }: { children: React.ReactNode; error: string | null }) {
  return (
    <div className="mt-auto pt-7">
      {error && (
        <div className="mb-3" role="alert">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
      <div className="flex gap-3 border-t border-[var(--color-border)] pt-5">{children}</div>
    </div>
  );
}
