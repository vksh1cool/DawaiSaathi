"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, Play, Check } from "lucide-react";
import { PrimaryButton, GhostButton, Field, TextInput, Chip, Banner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiJson, ApiError } from "@/lib/api-client";
import type { Language } from "@/types/domain";

export default function OnboardingPage() {
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const { refresh } = useAppInfo();

  const [step, setStep] = useState(0);
  const [caregiverName, setCaregiverName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("+91");
  const [self, setSelf] = useState(false);
  const [callLang, setCallLang] = useState<Language>("hi");
  const [voice, setVoice] = useState<"female" | "male">("female");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewVoice = async () => {
    try {
      const res = await apiJson<{ audioUrl: string }>("/api/tts/sample", "POST", {
        language: callLang,
        voiceGender: voice,
        name: patientName,
      });
      new Audio(res.audioUrl).play().catch(() => {});
    } catch {
      /* voice preview needs OpenAI key */
    }
  };

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiJson("/api/household", "POST", {
        caregiverName,
        uiLanguage: lang,
        patient: {
          name: self ? caregiverName : patientName,
          phoneE164: phone,
          language: callLang,
          voiceGender: voice,
        },
      });
      refresh();
      router.replace("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not finish setup.");
      setSaving(false);
    }
  };

  const phoneValid = /^\+\d{10,15}$/.test(phone);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-[var(--color-bg)] px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`}
            />
          ))}
        </div>
        <div className="flex rounded-full border border-[var(--color-border)] p-0.5 text-sm">
          {(["en", "hi"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 ${lang === l ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}
            >
              {l === "en" ? "EN" : "हि"}
            </button>
          ))}
        </div>
      </div>

      {step === 0 && (
        <div className="flex flex-1 flex-col">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image src="/logo.png" alt="DawaiSaathi" width={72} height={72} className="mb-3 rounded-2xl" />
            <h1 className="text-2xl font-bold text-[var(--color-primary)]">{t("brand.name")}</h1>
            <p className="text-[var(--color-text-muted)]">{t("brand.tagline")}</p>
          </div>
          <Field label={t("onboarding.yourName")}>
            <TextInput
              value={caregiverName}
              onChange={(e) => setCaregiverName(e.target.value)}
              placeholder={t("onboarding.yourNamePlaceholder")}
            />
          </Field>
          <div className="mt-auto pt-6">
            <PrimaryButton disabled={!caregiverName.trim()} onClick={() => setStep(1)}>
              {t("common.continue")} <ArrowRight size={18} />
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-1 flex-col">
          <h1 className="mb-6 text-xl font-bold">{t("onboarding.patientTitle")}</h1>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={self} onChange={(e) => setSelf(e.target.checked)} className="h-5 w-5" />
            {t("onboarding.selfCare")}
          </label>
          {!self && (
            <Field label={t("onboarding.patientName")}>
              <TextInput
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder={t("onboarding.patientNamePlaceholder")}
              />
            </Field>
          )}
          <div className="mt-3">
            <Field label={t("onboarding.patientPhone")}>
              <TextInput
                value={phone}
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+9198…"
              />
            </Field>
            <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{t("onboarding.phone_help")}</p>
          </div>
          <div className="mt-auto flex gap-2 pt-6">
            <GhostButton onClick={() => setStep(0)}>{t("common.back")}</GhostButton>
            <PrimaryButton
              className="flex-1"
              disabled={(!self && !patientName.trim()) || !phoneValid}
              onClick={() => setStep(2)}
            >
              {t("common.continue")} <ArrowRight size={18} />
            </PrimaryButton>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-1 flex-col">
          <h1 className="mb-6 text-xl font-bold">
            {t("onboarding.langTitle", { name: self ? caregiverName : patientName })}
          </h1>
          <div className="mb-4 flex gap-2">
            <Chip selected={callLang === "hi"} onClick={() => setCallLang("hi")}>
              हिन्दी
            </Chip>
            <Chip selected={callLang === "en"} onClick={() => setCallLang("en")}>
              English
            </Chip>
          </div>
          <span className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
            {t("onboarding.voice")}
          </span>
          <div className="mb-4 flex gap-2">
            <Chip selected={voice === "female"} onClick={() => setVoice("female")}>
              {t("onboarding.voiceFemale")}
            </Chip>
            <Chip selected={voice === "male"} onClick={() => setVoice("male")}>
              {t("onboarding.voiceMale")}
            </Chip>
          </div>
          <GhostButton onClick={previewVoice}>
            <Play size={16} /> {t("onboarding.previewVoice")}
          </GhostButton>

          {error && (
            <div className="mt-3">
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          <div className="mt-auto flex gap-2 pt-6">
            <GhostButton onClick={() => setStep(1)}>{t("common.back")}</GhostButton>
            <PrimaryButton className="flex-1" disabled={saving} onClick={finish}>
              <Check size={18} /> {t("onboarding.finish")}
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
