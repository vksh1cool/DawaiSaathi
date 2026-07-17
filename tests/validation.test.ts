import { describe, expect, it } from "vitest";
import { householdSchema, markDoseGroupSchema, postSchedulesSchema } from "@/lib/validation";

describe("Dose-group confirmation validation", () => {
  it("accepts a bounded set of unique dose event ids", () => {
    expect(markDoseGroupSchema.safeParse({ doseEventIds: ["dose-a", "dose-b"] }).success).toBe(true);
  });

  it("rejects duplicate ids before an atomic group update can be requested", () => {
    expect(markDoseGroupSchema.safeParse({ doseEventIds: ["dose-a", "dose-a"] }).success).toBe(false);
  });
});

describe("global reminder language validation", () => {
  it("accepts a supported call language while keeping app UI locales explicit", () => {
    expect(
      householdSchema.safeParse({
        caregiverName: "Asha",
        uiLanguage: "en",
        patient: {
          name: "Amina",
          phoneE164: "+254712345678",
          language: "sw",
          voiceGender: "female",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an unsupported language before it can affect a call", () => {
    expect(
      householdSchema.safeParse({
        caregiverName: "Asha",
        patient: {
          name: "Amina",
          phoneE164: "+254712345678",
          language: "zz",
          voiceGender: "female",
        },
      }).success,
    ).toBe(false);
  });

  it("does not allow consent for an SMS template that has not been reviewed", () => {
    expect(
      householdSchema.safeParse({
        caregiverName: "Asha",
        patient: {
          name: "Amina",
          phoneE164: "+254712345678",
          language: "sw",
          voiceGender: "female",
          smsReminderConsent: true,
        },
      }).success,
    ).toBe(false);
  });
});

describe("caregiver confirmation gates", () => {
  it("does not allow a reminder schedule to be enabled without an explicit instruction review", () => {
    expect(
      postSchedulesSchema.safeParse({
        schedules: [{ medicationId: "med-1", times: ["08:00"], doseInstruction: "1 tablet", foodRelation: "any", startDate: "2026-07-17" }],
      }).success,
    ).toBe(false);
  });

  it("does not allow an active schedule to omit the exact dose wording", () => {
    expect(
      postSchedulesSchema.safeParse({
        schedules: [{ medicationId: "med-1", times: ["08:00"], foodRelation: "any", startDate: "2026-07-17" }],
        reviewedAgainstInstructions: true,
      }).success,
    ).toBe(false);
  });
});
