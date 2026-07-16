import { callLLM } from "@/lib/openai";
import {
  EXTRACTION_SYSTEM,
  EXTRACTION_SCHEMA,
  extractionZod,
  type ExtractionResult,
} from "@/lib/prompts";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

export type RawMed = ExtractionResult["medications"][number];

/**
 * Workers cannot safely ship native image libraries. Upload validation keeps
 * vision inputs small enough to send directly as standard web image data URLs.
 */
export async function resizeToDataUrl(buffer: Uint8Array, mimeType = "image/jpeg"): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new AppError(
      "VALIDATION",
      "Please choose a JPEG, PNG, or WebP photo. On iPhone, use Share → Save to Files as JPEG if your photo is HEIC.",
    );
  }
  return `data:${mimeType};base64,${bytesToBase64(buffer)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let start = 0; start < bytes.length; start += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

/** Extract medicines from one photo. */
export async function extractPhoto(dataUrl: string): Promise<ExtractionResult> {
  return callLLM({
    system: EXTRACTION_SYSTEM,
    content: [
      { type: "text", text: "Extract all medicines from this photo." },
      { type: "image", dataUrl },
    ],
    schemaName: "extraction_result",
    jsonSchema: EXTRACTION_SCHEMA,
    zodSchema: extractionZod,
  });
}

/** Run extraction across photos in parallel, isolating per-photo failures (Data-Flow §2). */
export async function extractPhotos(
  dataUrls: string[],
  photoNumbers: number[] = dataUrls.map((_, index) => index + 1),
): Promise<{ medications: RawMed[]; imageIssues: string[] }> {
  const results = await Promise.allSettled(dataUrls.map((u) => extractPhoto(u)));
  const medications: RawMed[] = [];
  const imageIssues: string[] = [];
  let anySucceeded = false;

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      anySucceeded = true;
      medications.push(...r.value.medications);
      imageIssues.push(...r.value.imageIssues);
    } else {
      logger.warn({ photo: i, err: r.reason }, "photo extraction failed");
      imageIssues.push(`photo ${photoNumbers[i] ?? i + 1} could not be processed`);
    }
  });

  if (!anySucceeded && dataUrls.length > 0) {
    // Every photo failed → surface the underlying upstream error to the route.
    const firstRejection = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw firstRejection?.reason ?? new Error("No medicines could be extracted.");
  }

  return { medications: mergeMedications(medications), imageIssues };
}

/**
 * Keep each salt bound to its own strength. A key based only on the first
 * ingredient can incorrectly merge two combination medicines such as
 * 500 mg + 5 mg and 500 mg + 10 mg.
 */
const compositionSignature = (m: RawMed): string =>
  m.composition
    .map((component) => {
      const salt = component.saltNameAsPrinted.trim().toLowerCase().replace(/\s+/g, " ");
      const strength =
        component.strengthValue == null
          ? ""
          : `${component.strengthValue}${component.strengthUnit ?? ""}`.toLowerCase();
      return `${salt}:${strength}`;
    })
    .sort()
    .join("+");

const brandKey = (m: RawMed) => {
  const brand = m.brandName?.trim().toLowerCase();
  return brand ? `${brand}|${compositionSignature(m)}` : null;
};

const compositionKey = (m: RawMed) =>
  m.composition.length > 0 ? compositionSignature(m) : null;

/**
 * A front/back pair often has complementary information: the front may have a
 * brand but no composition, while the back has composition but no brand. Use
 * the brand key when both brands are visible, otherwise safely bridge through
 * the composition+unit-strength key. This preserves distinct branded strips
 * when both brands are readable.
 */
function representsSameMedicine(a: RawMed, b: RawMed): boolean {
  const aBrand = brandKey(a);
  const bBrand = brandKey(b);
  if (aBrand && bBrand) return aBrand === bBrand;

  const aComposition = compositionKey(a);
  const bComposition = compositionKey(b);
  return !!aComposition && aComposition === bComposition;
}

/** Merge two records for the same physical medicine, keeping higher-confidence values (Arch §8.2.1). */
function mergeTwo(a: RawMed, b: RawMed): RawMed {
  const pick = <K extends keyof RawMed["fieldConfidence"]>(
    field: K,
    aVal: unknown,
    bVal: unknown,
  ) => {
    const ac = a.fieldConfidence[field] ?? 0;
    const bc = b.fieldConfidence[field] ?? 0;
    // Prefer the non-null value; break ties by confidence.
    if (aVal == null && bVal != null) return bVal;
    if (bVal == null && aVal != null) return aVal;
    return bc > ac ? bVal : aVal;
  };
  return {
    brandName: pick("brandName", a.brandName, b.brandName) as string | null,
    composition:
      (b.fieldConfidence.composition ?? 0) > (a.fieldConfidence.composition ?? 0) ||
      ((b.fieldConfidence.composition ?? 0) === (a.fieldConfidence.composition ?? 0) &&
        b.composition.length > a.composition.length)
        ? b.composition
        : a.composition,
    form: a.form !== "other" ? a.form : b.form,
    packSize: (a.packSize ?? b.packSize) as number | null,
    mrpInr: pick("mrpInr", a.mrpInr, b.mrpInr) as number | null,
    expiryDate: pick("expiryDate", a.expiryDate, b.expiryDate) as string | null,
    batchNumber: (a.batchNumber ?? b.batchNumber) as string | null,
    manufacturer: (a.manufacturer ?? b.manufacturer) as string | null,
    fieldConfidence: {
      brandName: Math.max(a.fieldConfidence.brandName, b.fieldConfidence.brandName),
      composition: Math.max(a.fieldConfidence.composition, b.fieldConfidence.composition),
      mrpInr: Math.max(a.fieldConfidence.mrpInr, b.fieldConfidence.mrpInr),
      expiryDate: Math.max(a.fieldConfidence.expiryDate, b.fieldConfidence.expiryDate),
    },
    warnings: Array.from(new Set([...a.warnings, ...b.warnings])),
  };
}

/** Dedupe/merge medicines across all photos (Arch §8.2.1). */
export function mergeMedications(meds: RawMed[]): RawMed[] {
  const merged: RawMed[] = [];
  for (const m of meds) {
    const existingIndex = merged.findIndex((existing) => representsSameMedicine(existing, m));
    if (existingIndex === -1) merged.push(m);
    else merged[existingIndex] = mergeTwo(merged[existingIndex], m);
  }
  return merged;
}
