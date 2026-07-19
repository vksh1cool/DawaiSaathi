import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getHousehold } from "@/lib/household";
import { config } from "@/lib/config";
import { getRuntimeValue, usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { logger } from "@/lib/logger";
import { isSmsReminderLanguage } from "@/lib/languages";
import { SMS_REMINDER_CONSENT_VERSION } from "@/lib/sms";
import { householdSchema, patchHouseholdSchema } from "@/lib/validation";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { getSupabaseHousehold, type TenantHousehold } from "@/lib/supabase/household";

export const runtime = "nodejs";

function serializeLegacy(hh: NonNullable<Awaited<ReturnType<typeof getHousehold>>>) {
  const p = hh.patients[0];
  return {
    household: {
      id: hh.id,
      caregiverName: hh.caregiverName,
      uiLanguage: hh.uiLanguage,
      patient: p
        ? {
            id: p.id,
            name: p.name,
            phoneE164: p.phoneE164,
            language: p.language,
            voiceGender: p.voiceGender,
            timezone: p.timezone,
            smsReminderConsent: 'smsReminderConsentAt' in p ? !!p.smsReminderConsentAt : (p as any).smsReminderConsent,
          }
        : null,
    },
  };
}

function serializeTenant(hh: TenantHousehold) {
  return { household: hh };
}

type SmsConsentAction = "grant" | "revoke" | "unchanged";

/**
 * A new phone must be saved before consent can be granted again. This prevents
 * a stale checked box from carrying SMS consent to a different recipient.
 */
function resolveSmsConsentAction(input: {
  currentPhoneE164: string;
  currentLanguage: string;
  currentConsent: boolean;
  requestedPhoneE164?: string;
  requestedLanguage?: string;
  requestedConsent?: boolean;
}): SmsConsentAction {
  const phoneChanged =
    input.requestedPhoneE164 !== undefined && input.requestedPhoneE164 !== input.currentPhoneE164;
  const nextLanguage = input.requestedLanguage ?? input.currentLanguage;

  if (input.requestedConsent === true && phoneChanged) {
    throw new AppError("VALIDATION", "Save the new phone number first, then explicitly opt in to SMS follow-ups.");
  }
  if (input.requestedConsent === true && !isSmsReminderLanguage(nextLanguage)) {
    throw new AppError("VALIDATION", "SMS follow-ups are currently available only in English and Hindi.");
  }
  if (input.requestedConsent === false) return input.currentConsent ? "revoke" : "unchanged";
  if ((phoneChanged || !isSmsReminderLanguage(nextLanguage)) && input.currentConsent) return "revoke";
  if (input.requestedConsent === true && !input.currentConsent) return "grant";
  return "unchanged";
}

async function requireSupabaseCaregiver(): Promise<void> {
  const userId = await getSupabaseUserId();
  if (!userId) throw new AppError("UNAUTHORIZED", "Caregiver sign-in is required.");
}

async function getTenantOrThrow() {
  await requireSupabaseCaregiver();
  const household = await getSupabaseHousehold();
  if (!household) throw new AppError("NOT_FOUND", "No household set up yet. Complete onboarding first.");
  return household;
}

async function postSupabaseHousehold(request: Request) {
  await requireSupabaseCaregiver();
  const body = householdSchema.parse(await request.json());
  const idempotencyKey = z.string().uuid().safeParse(request.headers.get("idempotency-key"));
  if (!idempotencyKey.success) {
    throw new AppError("VALIDATION", "Please retry setup from this screen so we can keep it safely idempotent.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_household_onboarding", {
    caregiver_name_input: body.caregiverName,
    ui_language_input: body.uiLanguage,
    timezone_input: getRuntimeValue("DEFAULT_TZ") ?? config.defaultTz,
    patient_name_input: body.patient.name,
    patient_phone_e164_input: body.patient.phoneE164,
    patient_language_input: body.patient.language,
    patient_voice_gender_input: body.patient.voiceGender,
    sms_reminder_consent_input: body.patient.smsReminderConsent,
    idempotency_key_input: idempotencyKey.data,
  });
  if (error) {
    logger.warn({ code: error.code }, "Supabase household onboarding RPC failed");
    if (error.code === "23505") {
      throw new AppError("CONFLICT", "This caregiver already has a household. Onboarding was not changed.");
    }
    throw new AppError("INTERNAL", "We could not complete secure onboarding. Please try again.");
  }

  const household = await getSupabaseHousehold(supabase);
  if (!household) throw new AppError("INTERNAL", "Secure onboarding did not return a household. Please try again.");
  return NextResponse.json(serializeTenant(household), { status: 201 });
}

async function patchSupabaseHousehold(request: Request) {
  const household = await getTenantOrThrow();
  const body = patchHouseholdSchema.parse(await request.json());
  const supabase = await createSupabaseServerClient();
  const patientInput = body.patient;
  const consentAction =
    patientInput && household.patient
      ? resolveSmsConsentAction({
          currentPhoneE164: household.patient.phoneE164,
          currentLanguage: household.patient.language,
          currentConsent: household.patient.smsReminderConsent,
          requestedPhoneE164: patientInput.phoneE164,
          requestedLanguage: patientInput.language,
          requestedConsent: patientInput.smsReminderConsent,
        })
      : "unchanged";

  if (body.caregiverName !== undefined || body.uiLanguage !== undefined) {
    const householdPatch: Record<string, string> = {};
    if (body.caregiverName !== undefined) householdPatch.caregiver_name = body.caregiverName;
    if (body.uiLanguage !== undefined) householdPatch.ui_language = body.uiLanguage;
    const { error } = await supabase.from("households").update(householdPatch).eq("id", household.id);
    if (error) {
      logger.warn({ code: error.code }, "Supabase household settings update failed");
      throw new AppError("INTERNAL", "We could not save household settings. Please try again.");
    }
  }

  if (patientInput && household.patient) {
    const patientPatch: Record<string, string | null> = {};
    if (patientInput.name !== undefined) patientPatch.name = patientInput.name;
    if (patientInput.phoneE164 !== undefined) patientPatch.phone_e164 = patientInput.phoneE164;
    if (patientInput.language !== undefined) patientPatch.language = patientInput.language;
    if (patientInput.voiceGender !== undefined) patientPatch.voice_gender = patientInput.voiceGender;

    if (consentAction === "grant") {
      patientPatch.sms_reminder_consent_at = new Date().toISOString();
      patientPatch.sms_reminder_consent_version = SMS_REMINDER_CONSENT_VERSION;
    } else if (consentAction === "revoke") {
      patientPatch.sms_reminder_consent_at = null;
      patientPatch.sms_reminder_consent_version = null;
    }

    if (Object.keys(patientPatch).length > 0) {
      const { error } = await supabase.from("patients").update(patientPatch).eq("id", household.patient.id);
      if (error) {
        logger.warn({ code: error.code }, "Supabase patient settings update failed");
        throw new AppError("INTERNAL", "We could not save patient settings. Please try again.");
      }
    }
  }

  const updated = await getSupabaseHousehold(supabase);
  if (!updated) throw new AppError("NOT_FOUND", "No household set up yet.");
  return NextResponse.json(serializeTenant(updated));
}

/** GET /api/household. The Supabase path is tenant-scoped; legacy D1 stays demo-only. */
export const GET = withErrorBoundary(async () => {
  if (usesSupabaseAuth()) return NextResponse.json(serializeTenant(await getTenantOrThrow()));
  const household = await getHousehold();
  if (!household) throw new AppError("NOT_FOUND", "No household yet.");
  return NextResponse.json(serializeLegacy(household));
});

/** POST /api/household. */
export const POST = withErrorBoundary(async (request: Request) => {
  if (usesSupabaseAuth()) return postSupabaseHousehold(request);

  const existing = await getHousehold();
  if (existing) throw new AppError("CONFLICT", "A household already exists.");
  const body = householdSchema.parse(await request.json());
  const household = await prisma.household.create({
    data: {
      caregiverName: body.caregiverName,
      uiLanguage: body.uiLanguage,
      patients: {
        create: {
          name: body.patient.name,
          phoneE164: body.patient.phoneE164,
          language: body.patient.language,
          voiceGender: body.patient.voiceGender,
          timezone: config.defaultTz,
          smsReminderConsentAt: body.patient.smsReminderConsent ? new Date() : null,
          smsReminderConsentVersion: body.patient.smsReminderConsent ? SMS_REMINDER_CONSENT_VERSION : null,
        },
      },
    },
    include: { patients: true },
  });
  return NextResponse.json(serializeLegacy(household), { status: 201 });
});

/** PATCH /api/household. */
export const PATCH = withErrorBoundary(async (request: Request) => {
  if (usesSupabaseAuth()) return patchSupabaseHousehold(request);

  const household = await getHousehold();
  if (!household) throw new AppError("NOT_FOUND", "No household yet.");
  const body = patchHouseholdSchema.parse(await request.json());

  await prisma.$transaction(async (tx) => {
    if (body.caregiverName !== undefined || body.uiLanguage !== undefined) {
      await tx.household.update({
        where: { id: household.id },
        data: { caregiverName: body.caregiverName, uiLanguage: body.uiLanguage },
      });
    }
    if (body.patient && household.patients[0]) {
      const { smsReminderConsent, ...patientPatch } = body.patient;
      const consentAction = resolveSmsConsentAction({
        currentPhoneE164: household.patients[0].phoneE164,
        currentLanguage: household.patients[0].language,
        currentConsent: 'smsReminderConsentAt' in household.patients[0] ? !!household.patients[0].smsReminderConsentAt : (household.patients[0] as any).smsReminderConsent,
        requestedPhoneE164: patientPatch.phoneE164,
        requestedLanguage: patientPatch.language,
        requestedConsent: smsReminderConsent,
      });
      const consentFields =
        consentAction === "grant"
          ? { smsReminderConsentAt: new Date(), smsReminderConsentVersion: SMS_REMINDER_CONSENT_VERSION }
          : consentAction === "revoke"
            ? { smsReminderConsentAt: null, smsReminderConsentVersion: null }
            : {};
      await tx.patient.update({
        where: { id: household.patients[0].id },
        data: { ...patientPatch, ...consentFields },
      });
    }
  });

  const updated = await getHousehold();
  return NextResponse.json(serializeLegacy(updated!));
});
