import { z } from "zod";
import { APP_LANGUAGE_CODES, CALL_LANGUAGE_CODES } from "@/lib/languages";

/** Shared zod schemas for API bodies (Arch §6 — parse before any logic). */

const expiryDateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "expiry must be YYYY-MM")
  .nullable();

const dateSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "date must be YYYY-MM-DD")
  .refine((value) => {
    // Date.parse normalizes impossible dates (for example, 2026-02-31), so
    // validate the UTC round trip instead of merely checking for NaN.
    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }, "date must be valid");

const confidenceSchema = z.number().min(0).max(1);

export const saltSchema = z.object({
  inn: z.string().trim().min(1, "salt name is required"),
  fdaSearchName: z.string(),
  strengthValue: z.number().positive("strength must be positive").nullable(),
  strengthUnit: z
    .enum(["mg", "mcg", "g", "iu", "ml_per_5ml", "mg_per_5ml"])
    .nullable(),
});

export const draftMedicationSchema = z.object({
  tempId: z.string().min(1),
  brandName: z.string().nullable(),
  salts: z.array(saltSchema).min(1, "Add at least one salt before confirming."),
  form: z.enum(["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"]),
  packSize: z.number().int().positive().nullable(),
  mrpInr: z.number().nonnegative().nullable(),
  expiryDate: expiryDateSchema,
  batchNumber: z.string().nullable(),
  manufacturer: z.string().nullable(),
  fieldConfidence: z.object({
    brandName: confidenceSchema,
    salts: confidenceSchema,
    mrpInr: confidenceSchema,
    expiryDate: confidenceSchema,
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
  salts: z.array(saltSchema).min(1).optional(),
  form: z
    .enum(["tablet", "capsule", "syrup", "drops", "injection", "cream", "other"])
    .optional(),
  packSize: z.number().int().positive().nullable().optional(),
  mrpInr: z.number().nonnegative().nullable().optional(),
  expiryDate: expiryDateSchema.optional(),
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

export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:mm")
  .refine((value) => Number(value.slice(3)) % 15 === 0, "time must use 15-minute increments");

const scheduleInputSchema = z
  .object({
    medicationId: z.string().min(1),
    // An empty array intentionally deactivates an existing schedule for this
    // medicine. It must be sent explicitly rather than omitted, so old calls
    // can never remain active after a caregiver clears every time chip.
    times: z.array(timeSchema).max(4),
    foodRelation: foodRelationSchema,
    startDate: dateSchema,
    endDate: dateSchema.nullable().optional(),
  })
  .superRefine((schedule, ctx) => {
    if (new Set(schedule.times).size !== schedule.times.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["times"], message: "times must be unique" });
    }
    if (schedule.endDate && schedule.endDate < schedule.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "end date cannot be before start date",
      });
    }
  });

export const postSchedulesSchema = z
  .object({
    schedules: z.array(scheduleInputSchema).min(1),
    // The UI asks the caregiver to type the patient's name before it can save
    // a daily methotrexate schedule. Kept optional for normal schedules.
    weeklyOverridePatientName: z.string().trim().min(1).optional(),
  })
  .superRefine((body, ctx) => {
    const ids = body.schedules.map((schedule) => schedule.medicationId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedules"],
        message: "each medication can have only one active schedule",
      });
    }
  });

export const householdSchema = z.object({
  caregiverName: z.string().min(1),
  uiLanguage: z.enum(APP_LANGUAGE_CODES).default("en"),
  patient: z.object({
    name: z.string().min(1),
    phoneE164: z.string().regex(/^\+\d{7,15}$/, "phone must be E.164, e.g. +9198…"),
    language: z.enum(CALL_LANGUAGE_CODES).default("hi"),
    voiceGender: z.enum(["female", "male"]).default("female"),
  }),
});

export const patchHouseholdSchema = z.object({
  caregiverName: z.string().min(1).optional(),
  uiLanguage: z.enum(APP_LANGUAGE_CODES).optional(),
  patient: z
    .object({
      name: z.string().min(1).optional(),
      phoneE164: z.string().regex(/^\+\d{7,15}$/).optional(),
      language: z.enum(CALL_LANGUAGE_CODES).optional(),
      voiceGender: z.enum(["female", "male"]).optional(),
    })
    .optional(),
});

export const timeBodySchema = z.object({ time: timeSchema });
export const markDoseSchema = z.object({ status: z.enum(["confirmed", "skipped"]) });
export const markDoseGroupSchema = z
  .object({
    doseEventIds: z.array(z.string().min(1)).min(1).max(20),
  })
  .superRefine((body, ctx) => {
    if (new Set(body.doseEventIds).size !== body.doseEventIds.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["doseEventIds"], message: "dose events must be unique" });
    }
  });
export const simulateDigitsSchema = z.object({
  reminderCallId: z.string(),
  digits: z.enum(["", "1", "2"]),
});
