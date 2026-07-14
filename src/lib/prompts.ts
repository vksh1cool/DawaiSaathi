import { z } from "zod";

/**
 * All LLM prompts + JSON schemas + zod validators (Arch §8.2–8.5).
 * JSON schemas use strict mode: every property required, additionalProperties:false,
 * nullability via ["type","null"].
 */

/* ── Prompt 1: Strip extraction (vision, one call per photo) ────────── */

export const EXTRACTION_SYSTEM = `You are a meticulous pharmacy OCR specialist for INDIAN medicine packaging (blister strips, bottles, tubes).
Extract every distinct medicine visible in the image. Rules:
1) NEVER guess. If a value is not clearly readable, output null and add a warning string like "expiry not visible for <brand>".
2) Indian conventions: composition lines read like "Each film coated tablet contains: Telmisartan IP 40 mg". Brand name is the large text on the front foil. MRP appears as "M.R.P. Rs.234.00". Expiry appears as "EXP. 08/2027" or "EXP AUG 2027" and must be output as "2027-08". Batch appears as "B.No." or "Batch No.".
3) A photo may contain several strips; the SAME strip's front and back may both be visible — report each physical medicine once.
4) Strength: number + unit exactly as printed (mg, mcg, g, IU, ml). For syrups, strength may be per 5 ml.
5) MRP is for the whole pack; also extract pack size if printed ("15 Tablets" / "1x15").
6) fieldConfidence: your honest 0-1 confidence per field group.
Output strictly via the provided JSON schema. Do not include any medicine not visible in the image.`;

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    medications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          brandName: { type: ["string", "null"] },
          composition: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                saltNameAsPrinted: { type: "string" },
                strengthValue: { type: ["number", "null"] },
                strengthUnit: {
                  type: ["string", "null"],
                  enum: ["mg", "mcg", "g", "IU", "ml", "mg_per_5ml", null],
                },
              },
              required: ["saltNameAsPrinted", "strengthValue", "strengthUnit"],
            },
          },
          form: {
            type: "string",
            enum: ["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"],
          },
          packSize: { type: ["integer", "null"] },
          mrpInr: { type: ["number", "null"] },
          expiryDate: { type: ["string", "null"], description: "YYYY-MM" },
          batchNumber: { type: ["string", "null"] },
          manufacturer: { type: ["string", "null"] },
          fieldConfidence: {
            type: "object",
            additionalProperties: false,
            properties: {
              brandName: { type: "number" },
              composition: { type: "number" },
              mrpInr: { type: "number" },
              expiryDate: { type: "number" },
            },
            required: ["brandName", "composition", "mrpInr", "expiryDate"],
          },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "brandName",
          "composition",
          "form",
          "packSize",
          "mrpInr",
          "expiryDate",
          "batchNumber",
          "manufacturer",
          "fieldConfidence",
          "warnings",
        ],
      },
    },
    imageIssues: { type: "array", items: { type: "string" } },
  },
  required: ["medications", "imageIssues"],
} as const;

export const extractionZod = z.object({
  medications: z.array(
    z.object({
      brandName: z.string().nullable(),
      composition: z.array(
        z.object({
          saltNameAsPrinted: z.string(),
          strengthValue: z.number().nullable(),
          strengthUnit: z.enum(["mg", "mcg", "g", "IU", "ml", "mg_per_5ml"]).nullable(),
        }),
      ),
      form: z.enum(["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"]),
      packSize: z.number().int().nullable(),
      mrpInr: z.number().nullable(),
      expiryDate: z.string().nullable(),
      batchNumber: z.string().nullable(),
      manufacturer: z.string().nullable(),
      fieldConfidence: z.object({
        brandName: z.number(),
        composition: z.number(),
        mrpInr: z.number(),
        expiryDate: z.number(),
      }),
      warnings: z.array(z.string()),
    }),
  ),
  imageIssues: z.array(z.string()),
});
export type ExtractionResult = z.infer<typeof extractionZod>;

/* ── Prompt 2: Normalization (text, one call per batch) ─────────────── */

export const NORMALIZATION_SYSTEM = `You are a drug-nomenclature normalizer. Input: JSON of medicines extracted from Indian packaging.
For each medicine, and WITHOUT adding or removing medicines:
1) salts: canonical lowercase INN per component (e.g. "telmisartan"), strength normalized (mcg stays mcg; do not convert IU).
2) fdaSearchName per salt: the US Adopted Name used by FDA labels when it differs from INN (e.g. paracetamol -> "acetaminophen", salbutamol -> "albuterol"); otherwise repeat the INN, lowercase.
3) displayGeneric: single salt -> the INN; combination -> INNs joined with " + ".
4) usualFrequencyHint: typical adult frequency for this exact strength/formulation as commonly prescribed in India, as {timesPerDay, timing:["morning","evening",...]} — or null when regimens vary widely. This is a HINT for UI pre-fill only, never a recommendation.
5) Correct obvious OCR spelling errors in salt names (e.g. "telmisartn" -> "telmisartan"); if you cannot recognize a salt, keep it verbatim and set fdaSearchName to it unchanged.
Output strictly via the schema, one entry per input medicine, in the same order.`;

export const NORMALIZATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          salts: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                inn: { type: "string" },
                fdaSearchName: { type: "string" },
                strengthValue: { type: ["number", "null"] },
                strengthUnit: {
                  type: ["string", "null"],
                  enum: ["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml", null],
                },
              },
              required: ["inn", "fdaSearchName", "strengthValue", "strengthUnit"],
            },
          },
          displayGeneric: { type: "string" },
          usualFrequencyHint: {
            type: ["object", "null"],
            additionalProperties: false,
            properties: {
              timesPerDay: { type: ["integer", "null"] },
              timing: { type: "array", items: { type: "string" } },
            },
            required: ["timesPerDay", "timing"],
          },
        },
        required: ["salts", "displayGeneric", "usualFrequencyHint"],
      },
    },
  },
  required: ["results"],
} as const;

export const normalizationZod = z.object({
  results: z.array(
    z.object({
      salts: z.array(
        z.object({
          inn: z.string(),
          fdaSearchName: z.string(),
          strengthValue: z.number().nullable(),
          strengthUnit: z
            .enum(["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml"])
            .nullable(),
        }),
      ),
      displayGeneric: z.string(),
      usualFrequencyHint: z
        .object({
          timesPerDay: z.number().int().nullable(),
          timing: z.array(z.string()),
        })
        .nullable(),
    }),
  ),
});
export type NormalizationResult = z.infer<typeof normalizationZod>;

/* ── Prompt 3: Interaction synthesis (text, one call per run) ───────── */

export const INTERACTION_SYSTEM = `You are a cautious clinical-information assistant. You are given (1) a patient's medicine list with active salts, (2) interaction findings already confirmed from a curated database (context only — do NOT repeat these pairs), and (3) excerpts from US FDA drug labels for these salts.
Task: identify drug-drug interactions BETWEEN the listed salts that are explicitly supported by the provided label excerpts.
Rules:
1) For each finding, quote the supporting sentence(s) VERBATIM from the excerpts (<=300 chars) and name which salt's label it came from. Never fabricate or paraphrase inside evidenceQuote.
2) severity: "major" only if the label uses terms like contraindicated / serious / fatal / avoid combination; "moderate" for monitor / adjust dose / caution; "minor" otherwise.
3) If you strongly suspect an interaction between two listed salts but the excerpts do NOT support it, you may output it with source "llm_suspected" and severity "unverified", evidenceQuote null.
4) explanationEn/explanationHi: <=3 short sentences, 8th-grade reading level, name both medicines by brand. explanationHi in simple everyday Hindi (Devanagari).
5) actionEn/actionHi: one sentence; MUST tell the user to consult their doctor or pharmacist before the next dose.
6) Only pairs among the given salts. No food/alcohol/disease interactions. No duplicates of curated pairs.`;

export const INTERACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          saltA: { type: "string" },
          saltB: { type: "string" },
          severity: { type: "string", enum: ["major", "moderate", "minor", "unverified"] },
          source: { type: "string", enum: ["openfda", "llm_suspected"] },
          evidenceQuote: { type: ["string", "null"] },
          evidenceLabelSalt: { type: ["string", "null"] },
          explanationEn: { type: "string" },
          explanationHi: { type: "string" },
          actionEn: { type: "string" },
          actionHi: { type: "string" },
        },
        required: [
          "saltA",
          "saltB",
          "severity",
          "source",
          "evidenceQuote",
          "evidenceLabelSalt",
          "explanationEn",
          "explanationHi",
          "actionEn",
          "actionHi",
        ],
      },
    },
  },
  required: ["findings"],
} as const;

export const interactionZod = z.object({
  findings: z.array(
    z.object({
      saltA: z.string(),
      saltB: z.string(),
      severity: z.enum(["major", "moderate", "minor", "unverified"]),
      source: z.enum(["openfda", "llm_suspected"]),
      evidenceQuote: z.string().nullable(),
      evidenceLabelSalt: z.string().nullable(),
      explanationEn: z.string(),
      explanationHi: z.string(),
      actionEn: z.string(),
      actionHi: z.string(),
    }),
  ),
});
export type InteractionLLMResult = z.infer<typeof interactionZod>;

/* ── Prompt 4: Schedule suggestion (text, one call per batch) ───────── */

export const SCHEDULE_SYSTEM = `You suggest reminder time slots for a medicine list, for UI pre-fill only.
Allowed anchors: 08:00 (morning), 14:00 (afternoon), 20:00 (evening), 22:00 (night).
Use each medicine's usualFrequencyHint; map 1x/day->["08:00"], 2x/day->["08:00","20:00"], 3x/day->["08:00","14:00","20:00"], bedtime->["22:00"].
foodRelation from common practice for that salt (e.g. metformin -> after_food); use "any" when unsure.
If hint is null: ["08:00"], "any", lowConfidence=true. Never exceed the hinted frequency. Output via schema, one entry per input medicine, same order.`;

export const SCHEDULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          times: { type: "array", items: { type: "string" } },
          foodRelation: {
            type: "string",
            enum: ["before_food", "after_food", "with_food", "any"],
          },
          lowConfidence: { type: "boolean" },
        },
        required: ["times", "foodRelation", "lowConfidence"],
      },
    },
  },
  required: ["suggestions"],
} as const;

export const scheduleZod = z.object({
  suggestions: z.array(
    z.object({
      times: z.array(z.string()),
      foodRelation: z.enum(["before_food", "after_food", "with_food", "any"]),
      lowConfidence: z.boolean(),
    }),
  ),
});
export type ScheduleLLMResult = z.infer<typeof scheduleZod>;
