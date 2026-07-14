import { z } from "zod";

/** Shared zod schemas for API bodies (Arch §6 — parse before any logic). */

export const saltSchema = z.object({
  inn: z.string(),
  fdaSearchName: z.string(),
  strengthValue: z.number().nullable(),
  strengthUnit: z
    .enum(["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml"])
    .nullable(),
});

export const draftMedicationSchema = z.object({
  tempId: z.string(),
  brandName: z.string().nullable(),
  salts: z.array(saltSchema),
  form: z.enum(["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"]),
  packSize: z.number().int().nullable(),
  mrpInr: z.number().nullable(),
  expiryDate: z.string().nullable(),
  batchNumber: z.string().nullable(),
  manufacturer: z.string().nullable(),
  fieldConfidence: z.object({
    brandName: z.number(),
    salts: z.number(),
    mrpInr: z.number(),
    expiryDate: z.number(),
  }),
  warnings: z.array(z.string()),
  highRisk: z.boolean(),
  highRiskReason: z.string().nullable(),
  usualFrequencyHint: z
    .object({ timesPerDay: z.number().int().nullable(), timing: z.array(z.string()) })
    .nullable(),
  displayGeneric: z.string(),
});

export const postMedicationsSchema = z.object({
  scanBatchId: z.string().optional(),
  medications: z.array(draftMedicationSchema).min(1),
});

export const patchMedicationSchema = z.object({
  brandName: z.string().optional(),
  displayGeneric: z.string().optional(),
  salts: z.array(saltSchema).optional(),
  form: z
    .enum(["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"])
    .optional(),
  packSize: z.number().int().nullable().optional(),
  mrpInr: z.number().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  batchNumber: z.string().nullable().optional(),
  manufacturer: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const foodRelationSchema = z.enum([
  "before_food",
  "after_food",
  "with_food",
  "any",
]);

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm");

export const postSchedulesSchema = z.object({
  schedules: z
    .array(
      z.object({
        medicationId: z.string(),
        times: z.array(timeSchema).min(1),
        foodRelation: foodRelationSchema,
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }),
    )
    .min(1),
});

export const householdSchema = z.object({
  caregiverName: z.string().min(1),
  uiLanguage: z.enum(["en", "hi"]).default("en"),
  patient: z.object({
    name: z.string().min(1),
    phoneE164: z.string().regex(/^\+\d{7,15}$/, "phone must be E.164, e.g. +9198…"),
    language: z.enum(["hi", "en"]).default("hi"),
    voiceGender: z.enum(["female", "male"]).default("female"),
  }),
});

export const patchHouseholdSchema = z.object({
  caregiverName: z.string().min(1).optional(),
  uiLanguage: z.enum(["en", "hi"]).optional(),
  patient: z
    .object({
      name: z.string().min(1).optional(),
      phoneE164: z.string().regex(/^\+\d{7,15}$/).optional(),
      language: z.enum(["hi", "en"]).optional(),
      voiceGender: z.enum(["female", "male"]).optional(),
    })
    .optional(),
});

export const timeBodySchema = z.object({ time: timeSchema });
export const markDoseSchema = z.object({ status: z.enum(["confirmed", "skipped"]) });
export const simulateDigitsSchema = z.object({
  reminderCallId: z.string(),
  digits: z.string().max(1),
});
