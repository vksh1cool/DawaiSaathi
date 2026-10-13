"use client";

import { Trash2, Plus, CalendarX } from "lucide-react";
import { Card } from "@/components/ui";
import { ConfidenceField } from "@/components/ConfidenceField";
import { HighRiskBanner } from "@/components/HighRiskBanner";
import { PackCheckCard } from "@/components/PackCheckCard";
import { AuthenticityCard } from "@/components/AuthenticityCard";
import { useI18n } from "@/lib/i18n/provider";
import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication, Salt, MedForm, StrengthUnit } from "@/types/domain";

const FORMS: MedForm[] = ["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"];
const UNITS: Exclude<StrengthUnit, null>[] = ["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml"];
const UNIT_LABELS: Record<Exclude<StrengthUnit, null>, string> = {
  mg: "mg",
  mcg: "mcg",
  g: "g",
  iu: "IU",
  ml_per_5ml: "ml/5 ml",
  mg_per_5ml: "mg/5 ml",
};

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
      {exp === "expired" && draft.fieldConfidence.expiryDate >= 0.7 && (
        <div className="flex items-start gap-2 rounded-[10px] bg-[var(--color-danger-soft)] px-3 py-2 text-sm font-medium text-[var(--color-danger)]">
          <CalendarX size={18} className="mt-0.5 shrink-0" />
          {t("review.expired", { date: draft.expiryDate ?? "" })}
        </div>
      )}
      {exp === "expiring" && draft.fieldConfidence.expiryDate >= 0.7 && (
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
        placeholder={t("review.brandPlaceholder")}
      />

      {/* Salts */}
      <div>
        <span className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          {t("review.salt")}
        </span>
        <div className="flex flex-col gap-2">
          {draft.salts.map((s, i) => (
            // Below 420px the salt name takes its own line; strength, unit and
            // remove sit underneath, so the row never pushes the page sideways.
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input
                value={s.inn}
                onChange={(e) => setSalt(i, { inn: e.target.value, fdaSearchName: e.target.value })}
                className="min-h-[44px] min-w-0 basis-full rounded-[10px] border border-[var(--color-border)] px-2.5 text-base outline-none focus:border-[var(--color-primary)] min-[420px]:basis-0 min-[420px]:flex-1"
                placeholder={t("review.saltPlaceholder")}
                aria-label={`${t("review.salt")} ${i + 1}`}
              />
              <input
                type="number"
                value={s.strengthValue ?? ""}
                inputMode="decimal"
                min="0"
                step="any"
                onChange={(e) => setSalt(i, { strengthValue: finiteNumber(e.target.value) })}
                className="min-h-[44px] w-20 min-w-0 rounded-[10px] border border-[var(--color-border)] px-2 text-base outline-none focus:border-[var(--color-primary)] max-[419px]:flex-1"
                aria-label={`${t("review.salt")} ${i + 1} — ${t("review.strength")}`}
              />
              <select
                value={s.strengthUnit ?? "mg"}
                onChange={(e) => setSalt(i, { strengthUnit: e.target.value as StrengthUnit })}
                className="min-h-[44px] w-[6rem] shrink-0 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 text-sm outline-none"
                aria-label={`${t("review.salt")} ${i + 1} — ${t("review.unit")}`}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
              {draft.salts.length > 1 && (
                <button
                  type="button"
                  onClick={() => set({ salts: draft.salts.filter((_, idx) => idx !== i) })}
                  className="pressable flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[10px] p-2 text-[var(--color-text-muted)] transition-transform duration-150 ease-[var(--ease-out)]"
                  aria-label={`${t("common.remove")} — ${t("review.salt")} ${i + 1}`}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set({
                salts: [
                  ...draft.salts,
                  { inn: "", fdaSearchName: "", strengthValue: null, strengthUnit: "mg" },
                ],
              })
            }
            className="pressable flex min-h-[44px] items-center gap-1 self-start rounded-[10px] px-2 text-sm font-medium text-[var(--color-primary)] transition-transform duration-150 ease-[var(--ease-out)]"
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
                {t(`forms.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <ConfidenceField
          label={t("review.pack")}
          value={draft.packSize?.toString() ?? ""}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          onChange={(v) => set({ packSize: finiteInteger(v) })}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ConfidenceField
          label={t("review.mrp")}
          value={draft.mrpInr?.toString() ?? ""}
          type="number"
          confidence={draft.fieldConfidence.mrpInr}
          inputMode="decimal"
          min={0}
          step="0.01"
          onChange={(v) => set({ mrpInr: finiteNumber(v) })}
        />
        <ConfidenceField
          label={t("review.expiry")}
          value={draft.expiryDate ?? ""}
          type="month"
          confidence={draft.fieldConfidence.expiryDate}
          onChange={(v) => set({ expiryDate: v || null })}
          placeholder="YYYY-MM"
        />
        <ConfidenceField
          label={t("review.batch")}
          value={draft.batchNumber ?? ""}
          onChange={(v) => set({ batchNumber: v || null })}
        />
      </div>

      <ConfidenceField
        label={t("review.manufacturer")}
        value={draft.manufacturer ?? ""}
        onChange={(v) => set({ manufacturer: v || null })}
        placeholder={t("review.manufacturerPlaceholder")}
      />

      <PackCheckCard draft={draft} />

      <AuthenticityCard
        collapsible
        input={{
          brandName: draft.brandName,
          manufacturer: draft.manufacturer,
          mrpInr: draft.mrpInr,
          expiryDate: draft.expiryDate,
          batchNumber: draft.batchNumber,
          form: draft.form,
          salts: draft.salts,
        }}
      />

      {draft.highRisk && <HighRiskBanner name={draft.brandName ?? draft.displayGeneric} />}

      <button
        type="button"
        onClick={onRemove}
        className="pressable flex min-h-[44px] items-center gap-1 self-start rounded-[10px] px-2 text-sm font-medium text-[var(--color-danger)] transition-transform duration-150 ease-[var(--ease-out)]"
      >
        <Trash2 size={14} /> {t("common.remove")}
      </button>
    </Card>
  );
}

function finiteNumber(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteInteger(value: string): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}
