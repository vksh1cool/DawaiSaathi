"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import {
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
import { applyGenderedVoice, getSpeechVoices } from "@/lib/speech";

type VoiceGender = "female" | "male";
type ReminderFor = "self" | "other";

function initialCallLanguage(appLanguage: string): CallLanguage {
  if (appLanguage === "en" || appLanguage === "es") return appLanguage;
  return "hi";
}

function createSetupKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export default function OnboardingPage() {
  const { t, lang, setLang } = useI18n();
  const { refresh } = useAppInfo();

  const [reminderFor, setReminderFor] = useState<ReminderFor>("self");
  const [caregiverName, setCaregiverName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [phoneRegion, setPhoneRegion] = useState<DialingRegionCode>("IN");
  const [callLang, setCallLang] = useState<CallLanguage>(() => initialCallLanguage(lang));
  const [voice, setVoice] = useState<VoiceGender>("female");
  const [smsReminderConsent, setSmsReminderConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewRequestRef = useRef(0);
  const onboardingIdempotencyKeyRef = useRef<string | null>(null);

  const self = reminderFor === "self";
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

    const locale = speechLocale(language);
    const utterance = new SpeechSynthesisUtterance(voiceSampleScript(language, name));
    utterance.lang = locale;
    utterance.rate = 0.88;
    // Honour the female/male choice: the device fallback otherwise plays the
    // same OS default voice for both, making the toggle inaudible.
    applyGenderedVoice(utterance, locale, voice, getSpeechVoices());
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
    const selectedName = patientDisplayName || caregiverName.trim() || t("brand.name");
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

  const updateMobile = (value: string) => {
    setMobileNumber(phoneInputFromValue(value, phoneRegion));
    setError(null);
  };

  const validate = () => {
    if (!caregiverName.trim()) {
      setError(t("onboarding.nameRequired"));
      return false;
    }
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

  const leaveOnboarding = async () => {
    const appInfo = await refresh();
    const destination =
      appInfo?.authMode === "supabase" && !appInfo.tenantRuntimeReady
        ? "/secure-setup"
        : "/";
    window.location.replace(destination);
  };

  const finish = async () => {
    if (!validate()) return;

    stopPreview();
    setSaving(true);
    setError(null);
    try {
      onboardingIdempotencyKeyRef.current ??= createSetupKey();
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
        await leaveOnboarding();
        return;
      }
      setError(e instanceof ApiError ? e.message : t("onboarding.finishError"));
      setSaving(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void finish();
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-[560px] flex-col bg-[var(--color-bg)] px-4 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] pt-[calc(1rem_+_env(safe-area-inset-top))] sm:px-6">
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Image src="/logo.png" alt="" width={44} height={44} className="rounded-[13px]" priority />
          <div className="min-w-0">
            <p className="text-lg font-bold text-[var(--color-primary)]">{t("brand.name")}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{t("onboarding.simpleSetup")}</p>
          </div>
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

      <form className="flex flex-1 flex-col" onSubmit={submit} noValidate>
        <section className="onboarding-step flex flex-1 flex-col">
          <div className="mb-5">
            <p className="mb-2 text-sm font-semibold text-[var(--color-primary)]">{t("onboarding.welcomeEyebrow")}</p>
            <h1 className="max-w-[14ch] text-4xl font-bold leading-[1.05] text-[var(--color-text)]">
              {t("onboarding.setupTitle")}
            </h1>
            <p className="mt-3 max-w-[42ch] text-base leading-6 text-[var(--color-text-muted)]">{t("onboarding.setupBody")}</p>
          </div>

          <div className="mb-5 rounded-[16px] border border-[var(--color-primary)]/15 bg-[var(--color-primary-soft)]/45 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
              <p className="text-sm leading-5 text-[var(--color-text-muted)]">{t("onboarding.medicinePromise")}</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{t("onboarding.reminderFor")}</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("onboarding.reminderFor")}>
                <ReminderChoice
                  selected={self}
                  icon="self"
                  title={t("onboarding.selfCareShort")}
                  body={t("onboarding.selfCareHint")}
                  onClick={() => {
                    setReminderFor("self");
                    setError(null);
                  }}
                />
                <ReminderChoice
                  selected={!self}
                  icon="other"
                  title={t("onboarding.careForSomeoneShort")}
                  body={t("onboarding.careForSomeoneHint")}
                  onClick={() => {
                    setReminderFor("other");
                    setError(null);
                  }}
                />
              </div>
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

            {!self && (
              <Field label={t("onboarding.patientName")}>
                <TextInput
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

            <Field label={self ? t("onboarding.patientPhoneSelf") : t("onboarding.patientPhone")}>
              <div className={`flex min-h-[56px] overflow-hidden rounded-[14px] border bg-[var(--color-surface)] transition-colors ${error && !mobileValid ? "border-[var(--color-danger)]" : "border-[var(--color-border)] focus-within:border-[var(--color-primary)]"}`}>
                <label className="flex min-w-[8.25rem] items-center border-r border-[var(--color-border)] bg-[var(--color-bg)] px-2" aria-label={t("onboarding.phoneCountry")}>
                  <Smartphone size={17} className="mr-1 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                  <select
                    value={phoneRegion}
                    onChange={(event) => {
                      const next = event.target.value as DialingRegionCode;
                      setPhoneRegion(next);
                      setMobileNumber((current) => phoneInputFromValue(current, next));
                      setError(null);
                    }}
                    className="min-h-[52px] min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--color-text)] outline-none"
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
                  className="min-w-0 flex-1 bg-transparent px-3 text-lg text-[var(--color-text)] outline-none placeholder:text-base placeholder:text-[var(--color-text-muted)]"
                  aria-describedby="phone-help"
                  aria-invalid={!!error && !mobileValid}
                />
              </div>
              <p id="phone-help" className="mt-2 text-sm leading-5 text-[var(--color-text-muted)]">
                {t("onboarding.phoneHelp")}
              </p>
            </Field>

            <details className="group rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)]">
              <summary className="flex min-h-[58px] cursor-pointer list-none items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-[var(--color-text)]">
                <span className="flex items-center gap-2">
                  <Volume2 size={18} className="text-[var(--color-primary)]" aria-hidden="true" />
                  {t("onboarding.advancedTitle")}
                </span>
                <span className="text-sm text-[var(--color-primary)] group-open:hidden">{t("onboarding.customize")}</span>
                <span className="hidden text-sm text-[var(--color-text-muted)] group-open:inline">{t("onboarding.quickDefaults")}</span>
              </summary>
              <div className="space-y-5 border-t border-[var(--color-border)] px-4 py-4">
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

                <div>
                  <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{t("onboarding.voice")}</span>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("onboarding.voice")}>
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
                          className={`pressable flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border px-3 text-sm font-semibold transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
                            selected
                              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60 text-[var(--color-primary)]"
                              : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                          }`}
                        >
                          {selected && <CheckCircle2 size={18} aria-hidden="true" />}
                          {gender === "female" ? t("onboarding.voiceFemale") : t("onboarding.voiceMale")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[14px] bg-[var(--color-bg)] p-3">
                  <GhostButton type="button" onClick={() => void previewVoice()} disabled={previewing} className="w-full border-0 bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    {previewing ? <LoaderCircle size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                    {previewing ? t("onboarding.previewLoading") : t("onboarding.previewVoice")}
                  </GhostButton>
                  <p className="mt-2 min-h-5 px-1 text-sm leading-5 text-[var(--color-text-muted)]" role="status" aria-live="polite">
                    {voiceStatus ?? t("onboarding.previewHelp")}
                  </p>
                </div>

                <label className="flex min-h-[64px] cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-sm leading-5 text-[var(--color-text)]">
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
              </div>
            </details>
          </div>

          <div className="mt-auto pt-6">
            {error && (
              <div className="mb-3" role="alert">
                <Banner tone="danger">{error}</Banner>
              </div>
            )}
            <PrimaryButton type="submit" disabled={saving} aria-busy={saving}>
              {saving ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} />}
              {saving ? t("onboarding.finishing") : t("onboarding.startMedicineSetup")}
            </PrimaryButton>
            <p className="mt-3 text-center text-xs leading-5 text-[var(--color-text-muted)]">{t("onboarding.privacyNote")}</p>
          </div>
        </section>
      </form>
    </main>
  );
}

function ReminderChoice({
  selected,
  icon,
  title,
  body,
  onClick,
}: {
  selected: boolean;
  icon: "self" | "other";
  title: string;
  body: string;
  onClick: () => void;
}) {
  const Icon = icon === "self" ? User : Users;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`pressable flex min-h-[116px] flex-col items-start rounded-[16px] border p-3 text-left transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/60"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="mb-2 flex w-full items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--color-surface)] text-[var(--color-primary)]">
          <Icon size={18} aria-hidden="true" />
        </span>
        {selected && <CheckCircle2 size={20} className="text-[var(--color-primary)]" aria-hidden="true" />}
      </div>
      <span className="font-semibold text-[var(--color-text)]">{title}</span>
      <span className="mt-1 text-xs leading-4 text-[var(--color-text-muted)]">{body}</span>
    </button>
  );
}
