import sharp from "sharp";
import { callLLM } from "@/lib/openai";
import {
  EXTRACTION_SYSTEM,
  EXTRACTION_SCHEMA,
  extractionZod,
  type ExtractionResult,
} from "@/lib/prompts";
import { logger } from "@/lib/logger";

export type RawMed = ExtractionResult["medications"][number];

/** Resize to <=1600px long edge, jpeg q80, and return a base64 data URL (Arch §8.6). */
export async function resizeToDataUrl(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer)
    .rotate() // honor EXIF orientation
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString("base64")}`;
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
      imageIssues.push(`photo ${i + 1} could not be processed`);
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

const primaryStrength = (m: RawMed): string =>
  m.composition[0]?.strengthValue != null ? String(m.composition[0].strengthValue) : "";

const salts = (m: RawMed): string =>
  m.composition.map((c) => c.saltNameAsPrinted.trim().toLowerCase()).sort().join("+");

function mergeKey(m: RawMed): string {
  const brand = m.brandName?.trim().toLowerCase();
  return brand ? `${brand}|${primaryStrength(m)}` : `salts:${salts(m)}|${primaryStrength(m)}`;
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
      (a.fieldConfidence.composition ?? 0) >= (b.fieldConfidence.composition ?? 0)
        ? a.composition
        : b.composition,
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
  const byKey = new Map<string, RawMed>();
  for (const m of meds) {
    const key = mergeKey(m);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeTwo(existing, m) : m);
  }
  return Array.from(byKey.values());
}
