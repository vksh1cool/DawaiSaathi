"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Check, Camera } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ScheduleCard, type ScheduleDraft } from "@/components/ScheduleCard";
import { PrimaryButton, GhostButton, Banner, ModalDialog, Spinner, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import type { SerializedMedication } from "@/lib/medications";
import type { ScheduleSuggestion } from "@/types/domain";
import { speechLocale, type CallLanguage } from "@/lib/languages";
import { DateTime } from "luxon";

type ActiveSchedule = {
  medicationId: string;
  times: string[];
  doseInstruction: string | null;
  foodRelation: ScheduleDraft["foodRelation"];
};

export default function SchedulePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [drafts, setDrafts] = useState<ScheduleDraft[] | null>(null);
  const [patientName, setPatientName] = useState("");
  const [patientTimezone, setPatientTimezone] = useState("Asia/Kolkata");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mtxGuard, setMtxGuard] = useState<{ typed: string } | null>(null);
  const [emptyTimesGuard, setEmptyTimesGuard] = useState<ScheduleDraft[] | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [patientLanguage, setPatientLanguage] = useState<CallLanguage>("hi");
  const [reviewedAgainstInstructions, setReviewedAgainstInstructions] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewRequestRef = useRef(0);

  const load = useCallback(() => {
    setLoadError(null);
    setDrafts(null);
    (async () => {
      const [medsRes, sugRes, activeRes, hh] = await Promise.all([
        apiGet<{ medications: SerializedMedication[] }>("/api/medications"),
        apiGet<{ suggestions: ScheduleSuggestion[] }>("/api/schedules/suggest").catch(() => ({
          suggestions: [] as ScheduleSuggestion[],
        })),
        apiGet<{ schedules: ActiveSchedule[] }>("/api/schedules"),
        apiGet<{ household: { patient: { name: string; timezone: string; language: CallLanguage } | null } }>("/api/household"),
      ]);
      setPatientName(hh.household.patient?.name ?? "");
      setPatientTimezone(hh.household.patient?.timezone ?? "Asia/Kolkata");
      setPatientLanguage(hh.household.patient?.language ?? "hi");
      const sugMap = new Map(sugRes.suggestions.map((s) => [s.medicationId, s]));
      const activeMap = new Map(activeRes.schedules.map((schedule) => [schedule.medicationId, schedule]));
      setDrafts(
        medsRes.medications.map((m) => {
          const sug = sugMap.get(m.id);
          const active = activeMap.get(m.id);
          return {
            medicationId: m.id,
            brandName: m.brandName,
            displayGeneric: m.displayGeneric,
            highRisk: m.highRisk,
            // Never overwrite a caregiver's saved choices with a fresh AI
            // suggestion when they revisit this screen.
            times: active?.times ?? sug?.times ?? ["08:00"],
            doseInstruction: active?.doseInstruction ?? "",
            foodRelation: active?.foodRelation ?? sug?.foodRelation ?? "any",
            lowConfidence: active ? false : (sug?.lowConfidence ?? true),
            // carry specialCheck via a side map below
            ...(m.specialCheck === "weekly_check" ? { _mtx: true } : {}),
          } as ScheduleDraft & { _mtx?: boolean };
        }),
      );
    })().catch(() => {
      setLoadError(t("schedule.loadError"));
      setDrafts([]);
    });
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stopPreview = () => {
    previewRequestRef.current += 1;
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    window.speechSynthesis?.cancel();
    setPreviewing(false);
  };

  useEffect(() => {
    return () => {
      previewRequestRef.current += 1;
      previewAudioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speakPreview = (text: string, requestId: number) => {
    if (!("speechSynthesis" in window)) {
      setPreviewing(false);
      setError(t("schedule.previewUnavailable"));
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocale(patientLanguage);
    utterance.rate = 0.9;
    const finish = () => {
      if (requestId === previewRequestRef.current) setPreviewing(false);
    };
    utterance.onend = finish;
    utterance.onerror = () => {
      finish();
      if (requestId === previewRequestRef.current) setError(t("schedule.previewUnavailable"));
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const previewCall = async () => {
    if (!drafts) return;
    if (drafts.some((draft) => draft.times.length > 0 && !draft.doseInstruction.trim())) {
      setError(t("schedule.doseInstructionRequired"));
      return;
    }
    const evening = drafts.find((d) => d.times.includes("20:00")) ? "20:00" : drafts[0]?.times[0];
    if (!evening) return;
    const selected = drafts.filter((draft) => draft.times.includes(evening));
    if (selected.length === 0) return;
    stopPreview();
    const requestId = previewRequestRef.current;
    setPreviewing(true);
    setError(null);
    try {
      const res = await apiJson<{ audioUrl: string | null; scriptText: string }>("/api/tts/preview", "POST", {
        time: evening,
        schedules: selected.map((draft) => ({
          medicationId: draft.medicationId,
          doseInstruction: draft.doseInstruction,
          foodRelation: draft.foodRelation,
        })),
      });
      if (requestId !== previewRequestRef.current) return;
      if (!res.audioUrl) {
        speakPreview(res.scriptText, requestId);
        return;
      }
      const audio = new Audio(res.audioUrl);
      previewAudioRef.current = audio;
      let usedFallback = false;
      const useFallback = () => {
        if (usedFallback || requestId !== previewRequestRef.current) return;
        usedFallback = true;
        previewAudioRef.current = null;
        speakPreview(res.scriptText, requestId);
      };
      audio.onended = () => {
        if (requestId === previewRequestRef.current) setPreviewing(false);
      };
      audio.onerror = useFallback;
      await audio.play().catch(useFallback);
    } catch {
      if (requestId === previewRequestRef.current) {
        setPreviewing(false);
        setError(t("schedule.previewUnavailable"));
      }
    }
  };

  const doSave = async (list: ScheduleDraft[], weeklyOverridePatientName?: string) => {
    setSaving(true);
    setError(null);
    try {
      const today = DateTime.now().setZone(patientTimezone).toFormat("yyyy-MM-dd");
      await apiJson("/api/schedules", "POST", {
        schedules: list.map((d) => ({
          medicationId: d.medicationId,
          times: d.times,
          doseInstruction: d.doseInstruction,
          foodRelation: d.foodRelation,
          startDate: today,
        })),
        weeklyOverridePatientName,
        reviewedAgainstInstructions: true,
      });
      router.push("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("schedule.saveError"));
      setSaving(false);
      setMtxGuard(null);
    }
  };

  const continueAfterEmptyTimesGuard = () => {
    if (!drafts) return;
    // Methotrexate weekly guard (PRD F2).
    const mtx = drafts.filter(
      (d) => (d as ScheduleDraft & { _mtx?: boolean })._mtx && d.times.length > 0,
    );
    if (mtx.length > 0) {
      if (!patientName.trim()) {
        setError(t("schedule.loadError"));
        return;
      }
      setMtxGuard({ typed: "" });
      return;
    }
    void doSave(drafts);
  };

  const start = () => {
    if (!drafts) return;
    if (!reviewedAgainstInstructions) {
      setError(t("schedule.instructionsConfirmationRequired"));
      return;
    }
    if (drafts.some((draft) => draft.times.length > 0 && !draft.doseInstruction.trim())) {
      setError(t("schedule.doseInstructionRequired"));
      return;
    }
    const withoutReminders = drafts.filter((draft) => draft.times.length === 0);
    if (withoutReminders.length > 0) {
      setEmptyTimesGuard(withoutReminders);
      return;
    }
    continueAfterEmptyTimesGuard();
  };

  if (!drafts) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <Banner tone="warn">
          <p>{loadError}</p>
          <GhostButton className="mt-3" onClick={load}>
            {t("common.tryAgain")}
          </GhostButton>
        </Banner>
      </AppShell>
    );
  }

  if (drafts.length === 0) {
    return (
      <AppShell>
        <h1 className="mb-4 text-2xl font-bold">{t("schedule.title")}</h1>
        <EmptyState
          icon={Camera}
          title={t("schedule.empty")}
          action={
            <Link href="/scan" className="inline-block">
              <PrimaryButton>{t("schedule.goToScan")}</PrimaryButton>
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold">{t("schedule.title")}</h1>

      <div className="mb-4">
        <Banner tone="info">{t("schedule.instructionsNotice")}</Banner>
      </div>

      <div className="flex flex-col gap-3">
        {drafts.map((d) => (
          <ScheduleCard
            key={d.medicationId}
            draft={d}
            onChange={(next) =>
              setDrafts((prev) => prev!.map((x) => (x.medicationId === d.medicationId ? { ...x, ...next } : x)))
            }
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-5 text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={reviewedAgainstInstructions}
            onChange={(event) => {
              setReviewedAgainstInstructions(event.target.checked);
              if (event.target.checked) setError(null);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
          />
          <span>{t("schedule.instructionsConfirmation")}</span>
        </label>
        <GhostButton onClick={previewCall} disabled={previewing}>
          <Play size={16} /> {t("schedule.previewCall", { name: patientName })}
        </GhostButton>
        {error && <Banner tone="warn">{error}</Banner>}
        <PrimaryButton onClick={start} disabled={saving || !reviewedAgainstInstructions}>
          <Check size={18} /> {t("schedule.start")}
        </PrimaryButton>
      </div>

      {emptyTimesGuard && (
        <ModalDialog
          title={t("schedule.stopRemindersTitle")}
          onClose={saving ? undefined : () => setEmptyTimesGuard(null)}
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">{t("schedule.stopRemindersBody")}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-medium text-[var(--color-text)]">
            {emptyTimesGuard.map((draft) => <li key={draft.medicationId}>{draft.brandName}</li>)}
          </ul>
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" onClick={() => setEmptyTimesGuard(null)}>
              {t("common.cancel")}
            </GhostButton>
            <PrimaryButton
              className="!bg-[var(--color-danger)] flex-1"
              disabled={saving}
              onClick={() => {
                setEmptyTimesGuard(null);
                continueAfterEmptyTimesGuard();
              }}
            >
              {t("schedule.stopRemindersConfirm")}
            </PrimaryButton>
          </div>
        </ModalDialog>
      )}

      {mtxGuard && (
        <ModalDialog
          title={t("schedule.mtx_warning", { name: patientName })}
          onClose={saving ? undefined : () => setMtxGuard(null)}
        >
          <TextInput
            value={mtxGuard.typed}
            onChange={(e) => setMtxGuard({ typed: e.target.value })}
            placeholder={patientName}
            autoComplete="name"
            aria-label={t("schedule.mtx_warning", { name: patientName })}
          />
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={saving} onClick={() => setMtxGuard(null)}>
              {t("common.cancel")}
            </GhostButton>
            <PrimaryButton
              className="flex-1"
              disabled={mtxGuard.typed.trim() !== patientName.trim() || saving}
              onClick={() => void doSave(drafts, mtxGuard.typed)}
            >
              {t("common.confirm")}
            </PrimaryButton>
          </div>
        </ModalDialog>
      )}
    </AppShell>
  );
}
