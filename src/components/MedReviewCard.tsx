"use client";

import { Trash2, Plus, CalendarX } from "lucide-react";
import { Card } from "@/components/ui";
import { ConfidenceField } from "@/components/ConfidenceField";
import { HighRiskBanner } from "@/components/HighRiskBanner";
import { useI18n } from "@/lib/i18n/provider";
import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication, Salt, MedForm, StrengthUnit } from "@/types/domain";

const FORMS: MedForm[] = ["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"];
const UNITS: Exclude<StrengthUnit, null>[] = ["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml"];

export function MedReviewCard({
  draft,
  onChange,
  onRemove,
}: {
  draft: DraftMedication;
  onChange: (next: DraftMedication) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const set = (patch: Partial<DraftMedication>) => onChange({ ...draft, ...patch });
  const setSalt = (i: number, patch: Partial<Salt>) =>
    set({ salts: draft.salts.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  const exp = expiryStatus(draft.expiryDate);

  return (
    <Card className="flex flex-col gap-3">
      {exp === "expired" && (
        <div className="flex items-start gap-2 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--color-danger)]">
          <CalendarX size={18} className="mt-0.5 shrink-0" />
          {t("review.expired", { date: draft.expiryDate ?? "" })}
        </div>
      )}
      {exp === "expiring" && (
        <div className="flex items-start gap-2 rounded-[10px] bg-[var(--color-warn-soft)] px-3 py-2 text-sm font-medium text-[var(--color-warn)]">
          <CalendarX size={18} className="mt-0.5 shrink-0" />
          {t("review.expiring", { date: draft.expiryDate ?? "" })}
        </div>
      )}

      <ConfidenceField
        label={t("review.brand")}
        value={draft.brandName ?? ""}
        confidence={draft.fieldConfidence.brandName}
        onChange={(v) => set({ brandName: v })}
        placeholder="Telma 40"
      />

      {/* Salts */}
      <div>
        <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          {t("review.salt")}
        </span>
        <div className="flex flex-col gap-2">
          {draft.salts.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                value={s.inn}
                onChange={(e) => setSalt(i, { inn: e.target.value, fdaSearchName: e.target.value })}
                className="min-h-[44px] flex-1 rounded-[10px] border border-[var(--color-border)] px-2.5 text-base outline-none focus:border-[var(--color-primary)]"
                placeholder="telmisartan"
              />
              <input
                value={s.strengthValue ?? ""}
                inputMode="decimal"
                onChange={(e) =>
                  setSalt(i, { strengthValue: e.target.value ? Number(e.target.value) : null })
                }
                className="min-h-[44px] w-16 rounded-[10px] border border-[var(--color-border)] px-2 text-base outline-none focus:border-[var(--color-primary)]"
                placeholder="40"
              />
              <select
                value={s.strengthUnit ?? "mg"}
                onChange={(e) => setSalt(i, { strengthUnit: e.target.value as StrengthUnit })}
                className="min-h-[44px] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-sm outline-none"
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              {draft.salts.length > 1 && (
                <button
                  onClick={() => set({ salts: draft.salts.filter((_, idx) => idx !== i) })}
                  className="p-2 text-[var(--color-text-muted)]"
                  aria-label={t("common.remove")}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() =>
              set({
                salts: [
                  ...draft.salts,
                  { inn: "", fdaSearchName: "", strengthValue: null, strengthUnit: "mg" },
                ],
              })
            }
            className="flex items-center gap-1 self-start text-sm font-medium text-[var(--color-primary)]"
          >
            <Plus size={14} /> {t("review.addSalt")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
            {t("review.form")}
          </span>
          <select
            value={draft.form}
            onChange={(e) => set({ form: e.target.value as MedForm })}
            className="min-h-[44px] w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-base outline-none"
          >
            {FORMS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <ConfidenceField
          label={t("review.pack")}
          value={draft.packSize?.toString() ?? ""}
          inputMode="numeric"
          onChange={(v) => set({ packSize: v ? Number.parseInt(v, 10) : null })}
          placeholder="30"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ConfidenceField
          label={t("review.mrp")}
          value={draft.mrpInr?.toString() ?? ""}
          confidence={draft.fieldConfidence.mrpInr}
          inputMode="decimal"
          onChange={(v) => set({ mrpInr: v ? Number(v) : null })}
          placeholder="234"
        />
        <ConfidenceField
          label={t("review.expiry")}
          value={draft.expiryDate ?? ""}
          confidence={draft.fieldConfidence.expiryDate}
          onChange={(v) => set({ expiryDate: v || null })}
          placeholder="2027-08"
        />
        <ConfidenceField
          label={t("review.batch")}
          value={draft.batchNumber ?? ""}
          onChange={(v) => set({ batchNumber: v || null })}
        />
      </div>

      {draft.highRisk && <HighRiskBanner name={draft.brandName ?? draft.displayGeneric} />}

      <button
        onClick={onRemove}
        className="flex items-center gap-1 self-start text-sm font-medium text-[var(--color-danger)]"
      >
        <Trash2 size={14} /> {t("common.remove")}
      </button>
    </Card>
  );
}
