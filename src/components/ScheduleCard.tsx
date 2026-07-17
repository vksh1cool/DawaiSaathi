"use client";

import { Card, Chip, Field, TextInput } from "@/components/ui";
import { HighRiskBanner } from "@/components/HighRiskBanner";
import { useI18n } from "@/lib/i18n/provider";
import type { FoodRelation } from "@/types/domain";

export const ANCHORS: { key: string; time: string }[] = [
  { key: "morning", time: "08:00" },
  { key: "afternoon", time: "14:00" },
  { key: "evening", time: "20:00" },
  { key: "night", time: "22:00" },
];

const FOODS: { key: FoodRelation; label: string }[] = [
  { key: "before_food", label: "schedule.beforeFood" },
  { key: "after_food", label: "schedule.afterFood" },
  { key: "with_food", label: "schedule.withFood" },
  { key: "any", label: "schedule.anyFood" },
];

export type ScheduleDraft = {
  medicationId: string;
  brandName: string;
  displayGeneric: string;
  highRisk: boolean;
  times: string[];
  doseInstruction: string;
  foodRelation: FoodRelation;
  lowConfidence: boolean;
};

export function ScheduleCard({
  draft,
  onChange,
}: {
  draft: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
}) {
  const { t } = useI18n();

  const toggleTime = (time: string) => {
    const has = draft.times.includes(time);
    const times = has ? draft.times.filter((x) => x !== time) : [...draft.times, time].sort();
    onChange({ ...draft, times });
  };

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <p className="font-semibold">{draft.brandName}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{draft.displayGeneric}</p>
      </div>

      <div>
        <Field label={t("schedule.doseInstruction")}>
          <TextInput
            value={draft.doseInstruction}
            onChange={(event) => onChange({ ...draft, doseInstruction: event.target.value })}
            placeholder={t("schedule.dosePlaceholder")}
            autoComplete="off"
            aria-describedby={`dose-help-${draft.medicationId}`}
          />
        </Field>
        <p id={`dose-help-${draft.medicationId}`} className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)]">
          {t("schedule.doseHelp")}
        </p>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          {t("schedule.when")}
        </span>
        <div className="flex flex-wrap gap-2">
          {ANCHORS.map((a) => (
            <Chip key={a.time} selected={draft.times.includes(a.time)} onClick={() => toggleTime(a.time)}>
              {t(`schedule.${a.key}`)} {a.time}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
          {t("schedule.food")}
        </span>
        <div className="flex flex-wrap gap-2">
          {FOODS.map((f) => (
            <Chip
              key={f.key}
              selected={draft.foodRelation === f.key}
              onClick={() => onChange({ ...draft, foodRelation: f.key })}
            >
              {t(f.label)}
            </Chip>
          ))}
        </div>
      </div>

      {draft.lowConfidence && (
        <p className="text-xs italic text-[var(--color-text-muted)]">{t("schedule.suggested")}</p>
      )}

      {draft.highRisk && <HighRiskBanner name={draft.brandName} />}
    </Card>
  );
}
