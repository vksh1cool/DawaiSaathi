import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorBoundary, AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { getPatientOrThrow } from "@/lib/household";
import { getSlotMeds, buildSlotScripts } from "@/lib/reminder";
import { ensureAudio } from "@/lib/tts";
import { foodRelationSchema, timeBodySchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { buildSupabaseSlotScripts } from "@/lib/supabase/reminder";
import type { FoodRelation } from "@/types/domain";
import type { CallLanguage } from "@/lib/languages";

export const runtime = "nodejs";
export const maxDuration = 30;

const previewSchema = timeBodySchema
  .extend({
    // Preview the unsaved schedule draft instead of misleading a caregiver
    // with yesterday's persisted reminder list.
    schedules: z
      .array(
        z.object({
          medicationId: z.string().min(1),
          doseInstruction: z.string().trim().min(1).max(120),
          foodRelation: foodRelationSchema,
        }),
      )
      .min(1)
      .max(20)
      .optional(),
  })
  .superRefine((body, ctx) => {
    if (!body.schedules) return;
    const ids = body.schedules.map((schedule) => schedule.medicationId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["schedules"], message: "medicines must be unique" });
    }
  });

/** POST /api/tts/preview — the exact reminder audio for a slot (Arch §7.7, US-8). */
export const POST = withErrorBoundary(async (req: Request) => {
  const { time, schedules } = previewSchema.parse(await req.json());

  if (usesSupabaseAuth()) {
    const { scripts, language, voiceGender } = await buildSupabaseSlotScripts(time, schedules);
    try {
      const audio = await ensureAudio(scripts.greetingMedlist, language, voiceGender);
      return NextResponse.json({ audioUrl: audio.url, scriptText: scripts.greetingMedlist });
    } catch (err) {
      // A preview remains useful with the browser's built-in voice when OpenAI
      // TTS is not configured or temporarily unavailable.
      logger.warn({ err }, "schedule preview TTS unavailable (supabase) — returning script fallback");
      return NextResponse.json({ audioUrl: null, scriptText: scripts.greetingMedlist });
    }
  }

  const patient = await getPatientOrThrow();

  let slot: Awaited<ReturnType<typeof getSlotMeds>>;
  if (schedules) {
    const medications = await prisma.medication.findMany({
      where: { id: { in: schedules.map((schedule) => schedule.medicationId) }, patientId: patient.id, status: "active" },
      select: { id: true, brandName: true },
    });
    if (medications.length !== schedules.length) {
      throw new AppError("VALIDATION", "One or more medicines are not available for this preview.");
    }
    const medicationsById = new Map(medications.map((medication) => [medication.id, medication]));
    const foodRelations = new Set<FoodRelation>(schedules.map((schedule) => schedule.foodRelation));
    slot = {
      meds: schedules.map((schedule) => {
        const medication = medicationsById.get(schedule.medicationId)!;
        return { brandName: medication.brandName, doseInstruction: schedule.doseInstruction };
      }),
      foodRelation: foodRelations.size === 1 ? [...foodRelations][0]! : "any",
    };
  } else {
    slot = await getSlotMeds(patient.id, time);
  }
  if (slot.meds.length === 0) {
    throw new AppError("VALIDATION", "No medicines are scheduled at this time yet.");
  }
  const scripts = await buildSlotScripts(patient, time, slot);
  try {
    const audio = await ensureAudio(scripts.greetingMedlist, patient.language as CallLanguage, patient.voiceGender);
    return NextResponse.json({ audioUrl: audio.url, scriptText: scripts.greetingMedlist });
  } catch (err) {
    // A preview remains useful with the browser's built-in voice when OpenAI
    // TTS is not configured or temporarily unavailable.
    logger.warn({ err, patientId: patient.id }, "schedule preview TTS unavailable — returning script fallback");
    return NextResponse.json({ audioUrl: null, scriptText: scripts.greetingMedlist });
  }
});
