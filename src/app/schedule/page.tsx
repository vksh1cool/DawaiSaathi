"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScheduleCard, type ScheduleDraft } from "@/components/ScheduleCard";
import { PrimaryButton, GhostButton, Banner, Spinner, TextInput } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import type { SerializedMedication } from "@/lib/medications";
import type { ScheduleSuggestion } from "@/types/domain";

export default function SchedulePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [drafts, setDrafts] = useState<ScheduleDraft[] | null>(null);
  const [patientName, setPatientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mtxGuard, setMtxGuard] = useState<{ meds: ScheduleDraft[]; typed: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    (async () => {
      const [medsRes, sugRes, hh] = await Promise.all([
        apiGet<{ medications: SerializedMedication[] }>("/api/medications"),
        apiGet<{ suggestions: ScheduleSuggestion[] }>("/api/schedules/suggest").catch(() => ({
          suggestions: [] as ScheduleSuggestion[],
        })),
        apiGet<{ household: { patient: { name: string } | null } }>("/api/household").catch(
          () => ({ household: { patient: null } }),
        ),
      ]);
      setPatientName(hh.household.patient?.name ?? "");
      const sugMap = new Map(sugRes.suggestions.map((s) => [s.medicationId, s]));
      setDrafts(
        medsRes.medications.map((m) => {
          const sug = sugMap.get(m.id);
          return {
            medicationId: m.id,
            brandName: m.brandName,
            displayGeneric: m.displayGeneric,
            highRisk: m.highRisk,
            times: sug?.times ?? ["08:00"],
            foodRelation: sug?.foodRelation ?? "any",
            lowConfidence: sug?.lowConfidence ?? true,
            // carry specialCheck via a side map below
            ...(m.specialCheck === "weekly_check" ? { _mtx: true } : {}),
          } as ScheduleDraft & { _mtx?: boolean };
        }),
      );
    })().catch(() => setDrafts([]));
  }, []);

  const previewCall = async () => {
    if (!drafts) return;
    const evening = drafts.find((d) => d.times.includes("20:00")) ? "20:00" : drafts[0]?.times[0];
    if (!evening) return;
    setPreviewing(true);
    try {
      const res = await apiJson<{ audioUrl: string }>("/api/tts/preview", "POST", { time: evening });
      const audio = new Audio(res.audioUrl);
      await audio.play();
    } catch {
      setError("Preview unavailable — voice will be ready once configured.");
    } finally {
      setPreviewing(false);
    }
  };

  const doSave = async (list: ScheduleDraft[]) => {
    setSaving(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await apiJson("/api/schedules", "POST", {
        schedules: list
          .filter((d) => d.times.length > 0)
          .map((d) => ({
            medicationId: d.medicationId,
            times: d.times,
            foodRelation: d.foodRelation,
            startDate: today,
          })),
      });
      router.push("/");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save schedule.");
      setSaving(false);
      setMtxGuard(null);
    }
  };

  const start = () => {
    if (!drafts) return;
    // Methotrexate weekly guard (PRD F2).
    const mtx = drafts.filter(
      (d) => (d as ScheduleDraft & { _mtx?: boolean })._mtx && d.times.length > 0,
    );
    if (mtx.length > 0) {
      setMtxGuard({ meds: mtx, typed: "" });
      return;
    }
    doSave(drafts);
  };

  if (!drafts) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-4 text-2xl font-bold">{t("schedule.title")}</h1>

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
        <GhostButton onClick={previewCall} disabled={previewing}>
          <Play size={16} /> {t("schedule.previewCall", { name: patientName })}
        </GhostButton>
        {error && <Banner tone="warn">{error}</Banner>}
        <PrimaryButton onClick={start} disabled={saving}>
          <Check size={18} /> {t("schedule.start")}
        </PrimaryButton>
      </div>

      {mtxGuard && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="modal-shadow w-full max-w-[440px] rounded-[16px] bg-[var(--color-surface)] p-5">
            <p className="mb-3 text-sm font-medium text-[var(--color-danger)]">
              {t("schedule.mtx_warning", { name: patientName })}
            </p>
            <TextInput
              value={mtxGuard.typed}
              onChange={(e) => setMtxGuard({ ...mtxGuard, typed: e.target.value })}
              placeholder={patientName}
            />
            <div className="mt-3 flex gap-2">
              <GhostButton className="flex-1" onClick={() => setMtxGuard(null)}>
                {t("common.cancel")}
              </GhostButton>
              <PrimaryButton
                className="flex-1"
                disabled={mtxGuard.typed.trim() !== patientName.trim() || saving}
                onClick={() => doSave(drafts)}
              >
                {t("common.confirm")}
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
