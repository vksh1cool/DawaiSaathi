import { describe, expect, it } from "vitest";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import { CALL_LANGUAGE_CODES, callLanguageMeta, twilioVoiceLocale } from "@/lib/languages";
import { voiceSampleScript } from "@/lib/voice-samples";

describe("global reminder languages", () => {
  it("has metadata for every supported language", () => {
    for (const language of CALL_LANGUAGE_CODES) {
      expect(callLanguageMeta(language).nativeName).toBeTruthy();
      expect(callLanguageMeta(language).speechLocale).toMatch(/^[a-z]{2,3}-[A-Z]{2,3}$/);
    }
  });

  it("keeps a generated-audio-only language out of the Twilio <Say> fallback", () => {
    expect(twilioVoiceLocale("sw")).toBeNull();
    expect(twilioVoiceLocale("fr")).toBe("fr-FR");
  });

  it("builds a complete Swahili reminder script with the safety instruction", () => {
    const scripts = buildReminderScripts({
      patientName: "Amina",
      time: "20:00",
      meds: [{ brandName: "Telma 40", count: 1, form: "tablet" }],
      foodRelation: "after_food",
      language: "sw",
    });
    expect(scripts.greetingMedlist).toContain("Telma 40");
    expect(scripts.menu).toContain("1");
    expect(scripts.thanks).toContain("daktari au mfamasia");
    expect(voiceSampleScript("ar", "Fatima")).toContain("Fatima");
  });
});
