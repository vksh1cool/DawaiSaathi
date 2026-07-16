import { describe, expect, it } from "vitest";
import { householdSchema, markDoseGroupSchema } from "@/lib/validation";

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
});
