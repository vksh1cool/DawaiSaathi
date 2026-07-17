import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication } from "@/types/domain";

/**
 * A deliberately conservative packaging assessment.
 *
 * A photo cannot establish that a medicine is genuine: that needs an official
 * manufacturer/serial verification integration. This helper only tells the
 * caregiver whether the identifying pack details were captured clearly enough
 * to perform that official check or ask a pharmacist a useful question.
 */
export type PackCheckState =
  | "expired"
  | "needs_clearer_photo"
  | "needs_pack_details"
  | "details_captured";

export type PackDetail = "expiry" | "batch" | "manufacturer";

export type PackCheck = {
  state: PackCheckState;
  missing: PackDetail[];
};

const CONFIDENCE_THRESHOLD = 0.7;

export function getPackCheck(draft: Pick<
  DraftMedication,
  "brandName" | "salts" | "expiryDate" | "batchNumber" | "manufacturer" | "fieldConfidence"
>): PackCheck {
  const missing: PackDetail[] = [];
  if (!draft.expiryDate?.trim()) missing.push("expiry");
  if (!draft.batchNumber?.trim()) missing.push("batch");
  if (!draft.manufacturer?.trim()) missing.push("manufacturer");

  // Never instruct someone to discard a medicine from an uncertain OCR value.
  // A confident expired date is the only hard red state; uncertain dates send
  // the caregiver back to the physical pack for review.
  if (
    expiryStatus(draft.expiryDate) === "expired" &&
    draft.fieldConfidence.expiryDate >= CONFIDENCE_THRESHOLD
  ) {
    return { state: "expired", missing };
  }

  const unclearCoreDetail =
    draft.fieldConfidence.brandName < CONFIDENCE_THRESHOLD ||
    draft.fieldConfidence.salts < CONFIDENCE_THRESHOLD ||
    draft.fieldConfidence.expiryDate < CONFIDENCE_THRESHOLD;
  if (unclearCoreDetail) return { state: "needs_clearer_photo", missing };
  if (missing.length > 0) return { state: "needs_pack_details", missing };
  return { state: "details_captured", missing };
}
