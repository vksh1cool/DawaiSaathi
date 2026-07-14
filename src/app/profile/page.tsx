"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Languages, Settings, Phone, Trash2, Power } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, PrimaryButton, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiGet, apiJson } from "@/lib/api-client";

type Household = {
  caregiverName: string;
  uiLanguage: string;
  patient: {
    name: string;
    phoneE164: string;
    language: string;
    voiceGender: string;
  } | null;
};

export default function ProfilePage() {
  const { t, setLang } = useI18n();
  const { info, refresh } = useAppInfo();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ household: Household }>("/api/household")
      .then((res) => setHousehold(res.household))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async (updates: any) => {
    if (!household) return;
    setSaving(true);
    try {
      const merged = { ...household, ...updates, patient: updates.patient ? { ...household.patient!, ...updates.patient } : household.patient };
      await apiJson("/api/household", "PATCH", merged);
      setHousehold(merged);
      if (updates.uiLanguage) {
        setLang(updates.uiLanguage as any);
      }
      showToast(t("profile.saved"));
      refresh();
    } catch (e: any) {
      showToast("Error saving profile");
    } finally {
      setSaving(false);
    }
  };

  const eraseData = async () => {
    if (!confirm(t("profile.eraseConfirm"))) return;
    try {
      setLoading(true);
      await fetch("/api/demo/seed", { method: "DELETE" }); // Alternatively instruct to run purge script
      alert("Please run `npm run purge` on the server as DELETE is not exposed by default, or we can use the purge script.");
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const loadDemo = async () => {
    if (!confirm("Load demo Kamla Devi household? This replaces current data.")) return;
    try {
      setLoading(true);
      await apiJson("/api/demo/seed", "POST", {});
      window.location.href = "/";
    } catch (e) {
      alert("Error seeding demo.");
      setLoading(false);
    }
  };

  if (loading || !household || !household.patient) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  const { patient } = household;

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg)] transition-colors active:bg-[var(--color-border)]">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{t("profile.title")}</h1>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <User size={18} className="text-[var(--color-primary)]" />
            {t("onboarding.patientLabel")}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                {t("onboarding.patientName")}
              </label>
              <input
                type="text"
                value={patient.name}
                onChange={(e) => setHousehold({ ...household, patient: { ...patient, name: e.target.value } })}
                onBlur={(e) => handleSave({ patient: { name: e.target.value } })}
                className="w-full rounded-[12px] bg-[var(--color-bg)] px-4 py-3 outline-none ring-1 ring-[var(--color-border)] focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                {t("onboarding.patientPhone")}
              </label>
              <div className="flex items-center gap-2 rounded-[12px] bg-[var(--color-bg)] px-4 py-3 ring-1 ring-[var(--color-border)] focus-within:ring-[var(--color-primary)]">
                <Phone size={16} className="text-[var(--color-text-muted)]" />
                <input
                  type="tel"
                  value={patient.phoneE164}
                  onChange={(e) => setHousehold({ ...household, patient: { ...patient, phoneE164: e.target.value } })}
                  onBlur={(e) => handleSave({ patient: { phoneE164: e.target.value } })}
                  className="w-full bg-transparent outline-none"
                  dir="ltr"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                {t("onboarding.patientLang")}
              </label>
              <div className="flex gap-2">
                {(["hi", "en"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => handleSave({ patient: { language: l } })}
                    className={`flex-1 rounded-[12px] py-3 text-sm font-semibold transition-colors ${
                      patient.language === l
                        ? "bg-[var(--color-primary)] text-white"
                        : "bg-[var(--color-bg)] text-[var(--color-text)] ring-1 ring-[var(--color-border)]"
                    }`}
                  >
                    {t(`onboarding.lang_${l}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Languages size={18} className="text-[var(--color-primary)]" />
            {t("onboarding.caregiverLabel")}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
              {t("onboarding.caregiverName")}
            </label>
            <input
              type="text"
              value={household.caregiverName}
              onChange={(e) => setHousehold({ ...household, caregiverName: e.target.value })}
              onBlur={(e) => handleSave({ caregiverName: e.target.value })}
              className="mb-4 w-full rounded-[12px] bg-[var(--color-bg)] px-4 py-3 outline-none ring-1 ring-[var(--color-border)] focus:ring-[var(--color-primary)]"
            />
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
              App Language
            </label>
            <div className="flex gap-2">
              {(["hi", "en"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => handleSave({ uiLanguage: l })}
                  className={`flex-1 rounded-[12px] py-3 text-sm font-semibold transition-colors ${
                    household.uiLanguage === l
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text)] ring-1 ring-[var(--color-border)]"
                  }`}
                >
                  {l === "hi" ? "हिंदी" : "English"}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-danger)]">
            <Settings size={18} />
            {t("profile.dangerZone")}
          </div>
          
          {info?.demoMode && (
            <button
              onClick={loadDemo}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-soft)] py-3 font-semibold text-[var(--color-primary)] transition-colors active:bg-[var(--color-border)]"
            >
              <Power size={18} />
              Load Demo Data
            </button>
          )}
          
          <button
            onClick={eraseData}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-danger-soft)] py-3 font-semibold text-[var(--color-danger)] transition-colors active:bg-[var(--color-border)]"
          >
            <Trash2 size={18} />
            {t("profile.eraseData")}
          </button>
        </Card>
      </div>

      {toast && (
        <div className="fixed bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[var(--color-text)] px-4 py-2 text-sm text-white">
          {toast}
        </div>
      )}
    </AppShell>
  );
}
