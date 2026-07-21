"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MedReviewCard } from "@/components/MedReviewCard";
import { PrimaryButton, GhostButton, Banner, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiJson, ApiError } from "@/lib/api-client";
import type { DraftMedication } from "@/types/domain";

type ScanResult = { scanBatchId: string | null; medications: DraftMedication[]; imageIssues: string[] };

let manualCounter = 0;
const emptyDraft = (): DraftMedication => ({
  tempId: `manual_${manualCounter++}`,
  brandName: "",
  salts: [{ inn: "", fdaSearchName: "", strengthValue: null, strengthUnit: "mg" }],
  form: "tablet",
  packSize: null,
  mrpInr: null,
  expiryDate: null,
  batchNumber: null,
  manufacturer: null,
  fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
  warnings: [],
  highRisk: false,
  highRiskReason: null,
  usualFrequencyHint: null,
  displayGeneric: "",
});

export default function ReviewPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [meds, setMeds] = useState<DraftMedication[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewedAgainstPrescription, setReviewedAgainstPrescription] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("dawaisaathi.scan");
    if (!raw) {
      router.replace("/scan");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ScanResult;
      // scanBatchId is null for a medicine-picker session — it has no photo-derived scan
      // batch to claim/confirm, unlike a photo-scan session (see confirm() below).
      if (!Array.isArray(parsed.medications) || !Array.isArray(parsed.imageIssues)) {
        throw new Error("Invalid scan session");
      }
      setScan(parsed);
      setMeds(parsed.medications);
    } catch {
      sessionStorage.removeItem("dawaisaathi.scan");
      router.replace("/scan");
    }
  }, [router]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!reviewedAgainstPrescription) {
        setError(t("review.prescriptionConfirmationRequired"));
        setSaving(false);
        return;
      }
      // Normalize salts (strip empties) and persist.
      const cleaned = meds.map((m) => {
        const salts = m.salts.filter((salt) => salt.inn.trim() !== "");
        return {
          ...m,
          salts,
          displayGeneric: m.displayGeneric || salts.map((salt) => salt.inn).join(" + "),
        };
      });
      if (cleaned.some((medication) => medication.salts.length === 0)) {
        setError(t("review.saltRequired"));
        setSaving(false);
        return;
      }
      await apiJson("/api/medications", "POST", {
        ...(scan?.scanBatchId ? { scanBatchId: scan.scanBatchId } : {}),
        medications: cleaned,
        reviewedAgainstPrescription: true,
      });
      sessionStorage.removeItem("dawaisaathi.scan");

      // Trigger safety + savings runs; navigate based on findings (AC-2.2).
      let hasFindings = false;
      try {
        const res = await apiJson<{ findings: unknown[] }>("/api/interactions/run", "POST");
        hasFindings = (res.findings?.length ?? 0) > 0;
      } catch {
        /* interactions best-effort; continue */
      }
      apiJson("/api/generics/run", "POST").catch(() => undefined);

      router.push(hasFindings ? "/safety" : "/schedule");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save. Please try again.");
      setSaving(false);
    }
  };

  if (!scan) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold">{t("review.title", { n: meds.length })}</h1>
      <p className="mb-4 mt-1 text-sm text-[var(--color-text-muted)]">{t("review.subtitle")}</p>

      {scan.imageIssues.length > 0 && (
        <div className="mb-4">
          <Banner tone="warn">{scan.imageIssues.join(" · ")}</Banner>
        </div>
      )}

      <div className="mb-4">
        <Banner tone="info">{t("review.packCheckNotice")}</Banner>
      </div>

      <div className="flex flex-col gap-3">
        {meds.map((m) => (
          <MedReviewCard
            key={m.tempId}
            draft={m}
            onChange={(next) => setMeds((prev) => prev.map((x) => (x.tempId === m.tempId ? next : x)))}
            onRemove={() => setMeds((prev) => prev.filter((x) => x.tempId !== m.tempId))}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <GhostButton onClick={() => setMeds((prev) => [...prev, emptyDraft()])}>
          <Plus size={16} /> {t("review.addManual")}
        </GhostButton>

        <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm leading-5 text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={reviewedAgainstPrescription}
            onChange={(event) => {
              setReviewedAgainstPrescription(event.target.checked);
              if (event.target.checked) setError(null);
            }}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]"
          />
          <span>{t("review.prescriptionConfirmation")}</span>
        </label>

        {error && <Banner tone="danger">{error}</Banner>}

        <PrimaryButton disabled={saving || meds.length === 0 || !reviewedAgainstPrescription} onClick={confirm}>
          {saving ? (
            t("common.loading")
          ) : (
            <>
              <Check size={18} /> {t("review.confirmBtn", { n: meds.length })}
            </>
          )}
        </PrimaryButton>
      </div>
    </AppShell>
  );
}
