/** Shared domain types (Arch §5). */

import type { AppLanguage, CallLanguage } from "@/lib/languages";

export type StrengthUnit =
  | "mg"
  | "mcg"
  | "g"
  | "iu"
  | "ml_per_5ml"
  | "mg_per_5ml"
  | null;

export type Salt = {
  inn: string;
  fdaSearchName: string;
  strengthValue: number | null;
  strengthUnit: StrengthUnit;
};

export type MedForm =
  | "tablet"
  | "capsule"
  | "syrup"
  | "drops"
  | "injection"
  | "cream"
  | "other";

export type FrequencyHint = {
  timesPerDay: number | null;
  timing: string[];
};

export type FieldConfidence = {
  brandName: number;
  salts: number;
  mrpInr: number;
  expiryDate: number;
};

export type DraftMedication = {
  tempId: string;
  brandName: string | null;
  salts: Salt[];
  form: MedForm;
  packSize: number | null;
  mrpInr: number | null;
  expiryDate: string | null; // "YYYY-MM"
  batchNumber: string | null;
  manufacturer: string | null;
  fieldConfidence: FieldConfidence;
  warnings: string[];
  highRisk: boolean;
  highRiskReason: string | null;
  usualFrequencyHint: FrequencyHint | null;
  displayGeneric: string;
};

export type Severity = "major" | "moderate" | "minor" | "unverified";
export type FindingSource = "curated" | "openfda" | "llm_suspected";

export type EvidenceQuote = { source: string; quote: string };

export type Finding = {
  id: string;
  pairKey: string;
  medAId: string;
  medBId: string;
  saltA: string;
  saltB: string;
  brandA: string;
  brandB: string;
  severity: Severity;
  source: FindingSource;
  explanationEn: string;
  explanationHi: string;
  actionEn: string;
  actionHi: string;
  evidence: EvidenceQuote[];
  acknowledged: boolean;
};

export type GenericMatchResult = {
  id: string;
  medicationId: string;
  brandName: string;
  jaProductCode: string | null;
  jaProductName: string | null;
  jaPackSize: number | null;
  jaMrpInr: number | null;
  jaUnitPriceInr: number | null;
  brandUnitPriceInr: number | null;
  monthlySavingsInr: number | null;
  confidence: "high" | "medium" | "low" | null;
  estimated: boolean;
};

export type FoodRelation = "before_food" | "after_food" | "with_food" | "any";

export type ScheduleSuggestion = {
  medicationId: string;
  times: string[];
  foodRelation: FoodRelation;
  lowConfidence: boolean;
};

// `missed` is retained as the persisted legacy state, but means only that the
// reminder was not confirmed after retries—not that the person did not take it.
export type DoseStatus = "scheduled" | "calling" | "confirmed" | "missed" | "skipped";

export type TodayGroup = {
  time: string; // "HH:mm" patient-local
  scheduledAtUtc: string;
  status: "upcoming" | "confirmed" | "not_confirmed" | "mixed";
  foodRelation: FoodRelation;
  meds: {
    medicationId: string;
    brandName: string;
    count: number;
    form: MedForm;
    highRisk: boolean;
    expiryStatus: "expired" | "expiring" | "ok" | "unknown";
  }[];
  doseEventIds: string[];
};

/** @deprecated Prefer the explicit AppLanguage or CallLanguage type. */
export type Language = CallLanguage;
export type { AppLanguage, CallLanguage };
