"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User, Languages, Settings, Phone, Trash2, Power, Bell, UsersRound } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AppLanguageSelect } from "@/components/AppLanguageSelect";
import { CallLanguageSelect } from "@/components/CallLanguageSelect";
import { Banner, Card, GhostButton, ModalDialog, PrimaryButton, Spinner, TextInput, Toast } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiGet, apiJson } from "@/lib/api-client";
import {
  DIALING_REGIONS,
  phoneInputFromValue,
  phonePartsFromE164,
  phoneToE164,
  isValidPhoneInput,
  type DialingRegionCode,
} from "@/lib/onboarding";
import { useTimedMessage } from "@/lib/use-timed-message";
import { isSmsReminderLanguage, type AppLanguage, type CallLanguage } from "@/lib/languages";
import {
  getNotificationPermission,
  getRemindersEnabled,
  requestRemindersPermission,
  setRemindersEnabled,
} from "@/lib/alarms";

type Household = {
  caregiverName: string;
  uiLanguage: AppLanguage;
  patient: {
    name: string;
    phoneE164: string;
    language: CallLanguage;
    voiceGender: "female" | "male";
    smsReminderConsent: boolean;
  } | null;
};

type HouseholdPatch = {
  caregiverName?: string;
  uiLanguage?: AppLanguage;
  patient?: Partial<NonNullable<Household["patient"]>>;
};

type ConfirmationAction = "photos" | "erase" | "demo";

export default function ProfilePage() {
  const { t, setLang } = useI18n();
  const { info, refresh } = useAppInfo();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [household, setHousehold] = useState<Household | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [erasePhrase, setErasePhrase] = useState("");
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [phoneRegion, setPhoneRegion] = useState<DialingRegionCode>("IN");
  const [phoneInput, setPhoneInput] = useState("");
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [remindersEnabled, setRemindersEnabledState] = useState(false);
  const { message, showMessage } = useTimedMessage();
  const savedHouseholdRef = useRef<Household | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    apiGet<{ household: Household }>("/api/household")
      .then((res) => {
        savedHouseholdRef.current = res.household;
        setHousehold(res.household);
        if (res.household.patient) {
          const phone = phonePartsFromE164(res.household.patient.phoneE164);
          setPhoneRegion(phone.regionCode);
          setPhoneInput(phone.localNumber);
        }
      })
      .catch(() => setLoadError(t("profile.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
    setRemindersEnabledState(getRemindersEnabled());
  }, []);

  const toggleReminders = async (checked: boolean) => {
    if (!checked) {
      setRemindersEnabled(false);
      setRemindersEnabledState(false);
      return;
    }
    let permission = notifPermission;
    if (permission === "default") {
      permission = await requestRemindersPermission();
      setNotifPermission(permission);
    }
    if (permission === "granted") {
      setRemindersEnabled(true);
      setRemindersEnabledState(true);
    } else {
      showMessage(t("alarms.permissionError"));
    }
  };

  const handleSave = async (updates: HouseholdPatch) => {
    if (!household) return;
    setSaving(true);
    try {
      const result = await apiJson<{ household: Household }>("/api/household", "PATCH", updates);
      savedHouseholdRef.current = result.household;
      setHousehold(result.household);
      if (updates.uiLanguage) setLang(updates.uiLanguage);
      showMessage(t("profile.saved"));
      void refresh();
    } catch {
      if (savedHouseholdRef.current) setHousehold(savedHouseholdRef.current);
      showMessage(t("profile.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const patientName = async (value: string) => {
    const name = value.trim();
    if (!name) {
      const saved = savedHouseholdRef.current?.patient?.name;
      if (saved) {
        setHousehold((current) => current ? { ...current, patient: { ...current.patient!, name: saved } } : current);
      }
      showMessage(t("onboarding.patientRequired"));
      return;
    }
    await handleSave({ patient: { name } });
  };

  const patientPhone = async (value: string, regionCode = phoneRegion) => {
    if (!isValidPhoneInput(value, regionCode)) {
      const saved = savedHouseholdRef.current?.patient?.phoneE164;
      if (saved) {
        const phone = phonePartsFromE164(saved);
        setPhoneRegion(phone.regionCode);
        setPhoneInput(phone.localNumber);
      }
      showMessage(t("onboarding.phoneInvalid"));
      return;
    }
    await handleSave({ patient: { phoneE164: phoneToE164(value, regionCode) } });
  };

  const caregiverName = async (value: string) => {
    const name = value.trim();
    if (!name) {
      const saved = savedHouseholdRef.current?.caregiverName;
      if (saved) setHousehold((current) => current ? { ...current, caregiverName: saved } : current);
      showMessage(t("onboarding.nameRequired"));
      return;
    }
    await handleSave({ caregiverName: name });
  };

  const eraseData = async () => {
    try {
      setLoading(true);
      await apiJson("/api/demo/seed", "DELETE");
      await refresh();
      router.replace("/onboarding");
    } catch {
      setLoading(false);
      setConfirmationError(t("profile.eraseError"));
    }
  };

  const deletePhotos = async () => {
    setSaving(true);
    try {
      await apiJson("/api/photos", "DELETE");
      setConfirmation(null);
      showMessage(t("profile.photosDeleted"));
    } catch {
      setConfirmationError(t("profile.deletePhotosError"));
    } finally {
      setSaving(false);
    }
  };

  const loadDemo = async () => {
    try {
      setLoading(true);
      await apiJson("/api/demo/seed", "POST", {});
      window.location.href = "/";
    } catch {
      setLoading(false);
      setConfirmationError(t("profile.demoLoadError"));
    }
  };

  const openConfirmation = (action: ConfirmationAction) => {
    setConfirmation(action);
    setConfirmationError(null);
    setErasePhrase("");
  };

  const confirmAction = async () => {
    if (confirmation === "erase") {
      if (erasePhrase !== "DELETE") return;
      await eraseData();
    } else if (confirmation === "photos") {
      await deletePhotos();
    } else if (confirmation === "demo") {
      await loadDemo();
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  if (loadError || !household || !household.patient) {
    return (
      <AppShell>
        <Card tone="warn">
          <p className="text-sm">{loadError ?? t("profile.loadError")}</p>
          <PrimaryButton className="mt-3" onClick={load}>
            {t("common.tryAgain")}
          </PrimaryButton>
        </Card>
      </AppShell>
    );
  }

  const { patient } = household;
  const smsLanguageSupported = isSmsReminderLanguage(patient.language);

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" aria-label={t("common.back")} className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)]">
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
                disabled={saving}
                onChange={(e) => setHousehold((current) => current ? { ...current, patient: { ...current.patient!, name: e.target.value } } : current)}
                onBlur={(e) => void patientName(e.target.value)}
                className="min-h-[48px] w-full rounded-[12px] bg-[var(--color-bg)] px-4 py-3 outline-none ring-1 ring-[var(--color-border)] focus:ring-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                {t("onboarding.patientPhone")}
              </label>
              <div className="flex min-h-[52px] items-center rounded-[12px] bg-[var(--color-bg)] ring-1 ring-[var(--color-border)] focus-within:ring-[var(--color-primary)]">
                <Phone size={16} className="text-[var(--color-text-muted)]" />
                <select
                  value={phoneRegion}
                  disabled={saving}
                  aria-label={t("onboarding.phoneCountry")}
                  onChange={(event) => {
                    const next = event.target.value as DialingRegionCode;
                    const nextInput = phoneInputFromValue(phoneInput, next);
                    setPhoneRegion(next);
                    setPhoneInput(nextInput);
                    if (isValidPhoneInput(nextInput, next)) void patientPhone(nextInput, next);
                  }}
                  className="min-h-[48px] max-w-[120px] border-r border-[var(--color-border)] bg-transparent px-2 text-sm font-semibold text-[var(--color-text)] outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {DIALING_REGIONS.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.dialCode ? `${region.name} +${region.dialCode}` : region.name}
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  value={phoneInput}
                  disabled={saving}
                  autoComplete="tel"
                  inputMode="tel"
                  onChange={(event) => setPhoneInput(phoneInputFromValue(event.target.value, phoneRegion))}
                  onBlur={() => void patientPhone(phoneInput)}
                  className="min-w-0 flex-1 bg-transparent px-3 outline-none"
                  dir="ltr"
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{t("onboarding.phoneHelp")}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
                {t("onboarding.patientLang")}
              </label>
              <CallLanguageSelect
                value={patient.language}
                disabled={saving}
                onChange={(language) =>
                  void handleSave({
                    patient: {
                      language,
                      ...(isSmsReminderLanguage(language) ? {} : { smsReminderConsent: false }),
                    },
                  })
                }
                generatedAudioNotice={t("onboarding.generatedVoiceRequirement")}
              />
            </div>
            <label className={`flex min-h-[60px] items-start gap-3 rounded-[12px] bg-[var(--color-bg)] p-3 ring-1 ring-[var(--color-border)] ${smsLanguageSupported ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
              <input
                type="checkbox"
                checked={smsLanguageSupported && patient.smsReminderConsent}
                disabled={saving || !smsLanguageSupported}
                onChange={(event) => {
                  const smsReminderConsent = event.target.checked;
                  setHousehold((current) =>
                    current && current.patient
                      ? { ...current, patient: { ...current.patient, smsReminderConsent } }
                      : current,
                  );
                  void handleSave({ patient: { smsReminderConsent } });
                }}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)] disabled:opacity-40"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-text)]">{t("profile.smsConsentTitle")}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">
                  {smsLanguageSupported ? t("profile.smsConsentBody") : t("onboarding.smsLanguagePending")}
                </span>
              </span>
            </label>
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
              disabled={saving}
              onChange={(e) => setHousehold((current) => current ? { ...current, caregiverName: e.target.value } : current)}
              onBlur={(e) => void caregiverName(e.target.value)}
              className="mb-4 min-h-[48px] w-full rounded-[12px] bg-[var(--color-bg)] px-4 py-3 outline-none ring-1 ring-[var(--color-border)] focus:ring-[var(--color-primary)]"
            />
            <label className="mb-1 block text-sm font-medium text-[var(--color-text-muted)]">
              {t("profile.uiLang")}
            </label>
            <AppLanguageSelect
              value={household.uiLanguage}
              disabled={saving}
              label={t("profile.uiLang")}
              className="bg-[var(--color-bg)]"
              onChange={(uiLanguage) => void handleSave({ uiLanguage })}
            />
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Bell size={18} className="text-[var(--color-primary)]" />
            {t("alarms.permissionTitle")}
          </div>
          {notifPermission === "unsupported" ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("alarms.unsupported")}</p>
          ) : notifPermission === "denied" ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("alarms.blocked")}</p>
          ) : (
            <label className="flex min-h-[60px] cursor-pointer items-start gap-3 rounded-[12px] bg-[var(--color-bg)] p-3 ring-1 ring-[var(--color-border)]">
              <input
                type="checkbox"
                checked={notifPermission === "granted" && remindersEnabled}
                onChange={(e) => void toggleReminders(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span>
                <span className="block text-sm font-semibold text-[var(--color-text)]">{t("alarms.toggleLabel")}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">
                  {t("alarms.permissionBody")}
                </span>
              </span>
            </label>
          )}
        </Card>

        {info?.authMode === "supabase" && (
          <Card>
            <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
              <UsersRound size={18} className="text-[var(--color-primary)]" />
              {t("household.profileCardTitle")}
            </div>
            <p className="mb-4 text-sm leading-6 text-[var(--color-text-muted)]">
              {t("household.profileCardBody")}
            </p>
            <Link href="/household/members">
              <GhostButton className="w-full">{t("household.manageMembers")}</GhostButton>
            </Link>
          </Card>
        )}

        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-danger)]">
            <Settings size={18} />
            {t("profile.dangerZone")}
          </div>
          
          {info?.demoMode && (
            <button
              type="button"
              onClick={() => openConfirmation("demo")}
              disabled={saving}
              className="pressable mb-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary-soft)] py-3 font-semibold text-[var(--color-primary)] transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Power size={18} />
              {t("profile.demoLoad")}
            </button>
          )}

          <button
            type="button"
            onClick={() => openConfirmation("photos")}
            disabled={saving}
            className="pressable mb-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--color-danger)]/30 bg-[var(--color-surface)] py-3 font-semibold text-[var(--color-danger)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] disabled:opacity-50"
          >
            <Trash2 size={18} />
            {t("profile.deletePhotos")}
          </button>
          
          <button
            type="button"
            onClick={() => openConfirmation("erase")}
            disabled={saving}
            className="pressable flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--color-danger-soft)] py-3 font-semibold text-[var(--color-danger)] transition-[transform,background-color,opacity] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={18} />
            {t("profile.eraseAll")}
          </button>
        </Card>
      </div>

      {message && <Toast>{message}</Toast>}

      {confirmation && (
        <ModalDialog
          title={confirmation === "photos" ? t("profile.deletePhotos") : confirmation === "demo" ? t("profile.demoLoad") : t("profile.eraseAll")}
          onClose={saving ? undefined : () => setConfirmation(null)}
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            {confirmation === "photos"
              ? t("profile.deletePhotosConfirm")
              : confirmation === "demo"
                ? t("profile.demoLoadConfirm")
                : t("profile.eraseConfirm")}
          </p>
          {confirmation === "erase" && (
            <TextInput
              className="mt-4"
              value={erasePhrase}
              onChange={(event) => setErasePhrase(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
              aria-label={t("profile.eraseConfirm")}
            />
          )}
          {confirmationError && <Banner tone="danger"><span role="alert">{confirmationError}</span></Banner>}
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={saving} onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </GhostButton>
            <PrimaryButton
              className="!bg-[var(--color-danger)] flex-1"
              disabled={saving || (confirmation === "erase" && erasePhrase !== "DELETE")}
              onClick={() => void confirmAction()}
            >
              {t("common.confirm")}
            </PrimaryButton>
          </div>
        </ModalDialog>
      )}
    </AppShell>
  );
}
