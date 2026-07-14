import type { Medication } from "@prisma/client";
import {
  parseSalts,
  parseFieldConfidence,
  parseFrequencyHint,
} from "@/lib/db";
import { lookupHighRisk } from "@/lib/reference-data";
import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication, Salt, MedForm } from "@/types/domain";

export type SerializedMedication = {
  id: string;
  brandName: string;
  displayGeneric: string;
  salts: Salt[];
  form: MedForm;
  packSize: number | null;
  mrpInr: number | null;
  expiryDate: string | null;
  expiryStatus: "expired" | "expiring" | "ok" | "unknown";
  batchNumber: string | null;
  manufacturer: string | null;
  highRisk: boolean;
  highRiskReason: string | null;
  specialCheck: string; // "none" | "weekly_check"
  fieldConfidence: ReturnType<typeof parseFieldConfidence>;
  usualFrequencyHint: ReturnType<typeof parseFrequencyHint>;
  status: string;
};

/** Compute the special-check flag (e.g. methotrexate weekly guard) from salts. */
export function computeSpecialCheck(salts: Salt[]): string {
  for (const s of salts) {
    const hr = lookupHighRisk(s.inn);
    if (hr && hr.specialCheck !== "none") return hr.specialCheck;
  }
  return "none";
}

/** Medication row → API response object (JSON columns expanded — Arch §5). */
export function serializeMedication(med: Medication): SerializedMedication {
  const salts = parseSalts(med);
  return {
    id: med.id,
    brandName: med.brandName,
    displayGeneric: med.displayGeneric,
    salts,
    form: med.form as MedForm,
    packSize: med.packSize,
    mrpInr: med.mrpInr,
    expiryDate: med.expiryDate,
    expiryStatus: expiryStatus(med.expiryDate),
    batchNumber: med.batchNumber,
    manufacturer: med.manufacturer,
    highRisk: med.highRisk,
    highRiskReason: med.highRiskReason,
    specialCheck: computeSpecialCheck(salts),
    fieldConfidence: parseFieldConfidence(med),
    usualFrequencyHint: parseFrequencyHint(med),
    status: med.status,
  };
}

/** DraftMedication (client-confirmed) → Prisma create data. */
export function draftToCreateData(draft: DraftMedication, patientId: string, scanBatchId?: string) {
  return {
    patientId,
    scanBatchId: scanBatchId ?? null,
    brandName: draft.brandName?.trim() || "Unknown medicine",
    displayGeneric: draft.displayGeneric || draft.salts.map((s) => s.inn).join(" + "),
    saltsJson: JSON.stringify(draft.salts),
    form: draft.form,
    packSize: draft.packSize,
    mrpInr: draft.mrpInr,
    expiryDate: draft.expiryDate,
    batchNumber: draft.batchNumber,
    manufacturer: draft.manufacturer,
    highRisk: draft.highRisk,
    highRiskReason: draft.highRiskReason,
    fieldConfidenceJson: JSON.stringify(draft.fieldConfidence),
    usualFrequencyHint: draft.usualFrequencyHint
      ? JSON.stringify(draft.usualFrequencyHint)
      : null,
    status: "active",
  };
}
