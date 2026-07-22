"use client";

import { ApiError, apiGet, apiJson } from "@/lib/api-client";
import { randomUuid } from "@/lib/util/browser-id";
import type { AppLanguage } from "@/lib/languages";

type SeededMedication = { id: string };

/**
 * Seeds a starter household right after `signInAnonymously()` succeeds, so
 * Home/Schedule are not empty for a "Try the demo" session. Reuses the same
 * brand demo persona (Priya / Kamla Devi, Telma 40) as the frozen presenter
 * demo in `src/lib/demo.ts` — that seed is Prisma/D1-only and gated on
 * `!usesSupabaseAuth()`, so it cannot be reused directly for a per-user
 * Supabase tenant household.
 *
 * The legacy D1 reminder worker (see `worker/index.ts`) is disabled whenever
 * the Supabase tenant runtime is active (`legacyTenantDataBlocked()`), and it
 * never reads Supabase tables in the first place — so seeding a fabricated
 * phone number here can never trigger a real outbound Twilio call.
 *
 * Every step is caught rather than propagated: an anonymous session is still
 * useful even if a later enrichment step fails, so the caller can always
 * proceed to `nextPath` after calling this.
 */
export async function seedDemoHousehold(uiLanguage: AppLanguage): Promise<void> {
  try {
    await apiJson(
      "/api/household",
      "POST",
      {
        caregiverName: "Priya",
        uiLanguage,
        patient: {
          name: "Kamla Devi",
          phoneE164: "+911234567890",
          language: "hi",
          voiceGender: "female",
          smsReminderConsent: false,
        },
      },
      { headers: { "Idempotency-Key": randomUuid() } },
    );
  } catch (reason) {
    // CONFLICT means a household already exists for this session (e.g. a
    // double click retried the request) — safe to keep seeding into it.
    if (!(reason instanceof ApiError && reason.code === "CONFLICT")) {
      // eslint-disable-next-line no-console
      console.warn("[demo] household seed failed", reason);
      return;
    }
  }

  // Idempotency: if this household already has medications (e.g. the demo was
  // started before, or the user has already scanned their own strips), never
  // add the starter medicine again. Re-seeding was the source of the duplicate
  // "Telma 40" rows on the savings screen.
  try {
    const existing = await apiGet<{ medications: SeededMedication[] }>("/api/medications");
    if (existing.medications.length > 0) return;
  } catch {
    // If we cannot read the current medications, fall through and let the
    // create step's own error handling deal with it rather than blocking seed.
  }

  try {
    const { medications } = await apiJson<{ medications: SeededMedication[] }>("/api/medications", "POST", {
      medications: [
        {
          tempId: "demo_telmisartan",
          brandName: "Telma 40",
          salts: [{ inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" }],
          form: "tablet",
          packSize: 30,
          mrpInr: 234,
          expiryDate: "2027-12",
          batchNumber: null,
          manufacturer: null,
          fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
          warnings: [],
          highRisk: false,
          highRiskReason: null,
          usualFrequencyHint: { timesPerDay: 1, timing: ["morning"] },
          displayGeneric: "telmisartan",
        },
      ],
      reviewedAgainstPrescription: true,
    });

    const medicationId = medications[0]?.id;
    if (!medicationId) return;

    const today = new Date().toISOString().slice(0, 10);
    await apiJson("/api/schedules", "POST", {
      schedules: [
        {
          medicationId,
          times: ["08:00"],
          doseInstruction: "एक गोली",
          foodRelation: "after_food",
          startDate: today,
        },
      ],
      reviewedAgainstInstructions: true,
    });
  } catch (reason) {
    // eslint-disable-next-line no-console
    console.warn("[demo] medication/schedule seed failed", reason);
  }
}
