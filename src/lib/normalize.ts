import { callLLM } from "@/lib/openai";
import {
  NORMALIZATION_SYSTEM,
  NORMALIZATION_SCHEMA,
  normalizationZod,
} from "@/lib/prompts";
import { lookupHighRisk } from "@/lib/reference-data";
import { expiryStatus } from "@/lib/util/dates";
import type { DraftMedication, Salt } from "@/types/domain";
import type { RawMed } from "@/lib/extraction";

let counter = 0;
const nextTempId = () => `draft_${Date.now()}_${counter++}`;

/**
 * Normalize merged raw extractions into DraftMedications:
 * canonical salts (LLM), then code-side high-risk tagging + expiry warnings.
 */
export async function buildDraftMedications(rawMeds: RawMed[]): Promise<DraftMedication[]> {
  if (rawMeds.length === 0) return [];

  const input = rawMeds.map((m) => ({
    brandName: m.brandName,
    composition: m.composition,
    form: m.form,
  }));

  const { results } = await callLLM({
    system: NORMALIZATION_SYSTEM,
    content: [{ type: "text", text: JSON.stringify(input) }],
    schemaName: "normalization_result",
    jsonSchema: NORMALIZATION_SCHEMA,
    zodSchema: normalizationZod,
  });

  return rawMeds.map((raw, i) => {
    const norm = results[i];
    const salts: Salt[] = norm?.salts ?? [];

    // High-risk tagging (code, not LLM) — Arch §8.3 / PRD F2.
    let highRisk = false;
    let highRiskReason: string | null = null;
    for (const s of salts) {
      const hr = lookupHighRisk(s.inn);
      if (hr) {
        highRisk = true;
        highRiskReason = hr.reasonEn;
        break;
      }
    }

    // Expiry warnings.
    const warnings = [...raw.warnings];
    const exp = expiryStatus(raw.expiryDate);
    if (exp === "expired") warnings.push(`expired (${raw.expiryDate})`);
    else if (exp === "expiring") warnings.push(`expiry within 60 days (${raw.expiryDate})`);

    return {
      tempId: nextTempId(),
      brandName: raw.brandName,
      salts,
      form: raw.form,
      packSize: raw.packSize,
      mrpInr: raw.mrpInr,
      expiryDate: raw.expiryDate,
      batchNumber: raw.batchNumber,
      manufacturer: raw.manufacturer,
      fieldConfidence: {
        brandName: raw.fieldConfidence.brandName,
        salts: raw.fieldConfidence.composition,
        mrpInr: raw.fieldConfidence.mrpInr,
        expiryDate: raw.fieldConfidence.expiryDate,
      },
      warnings,
      highRisk,
      highRiskReason,
      usualFrequencyHint: norm?.usualFrequencyHint ?? null,
      displayGeneric: norm?.displayGeneric ?? salts.map((s) => s.inn).join(" + "),
    } satisfies DraftMedication;
  });
}
