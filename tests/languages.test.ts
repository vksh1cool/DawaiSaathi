import { describe, expect, it } from "vitest";
import { buildReminderScripts } from "@/lib/ivr/scripts";
import {
  APP_LANGUAGE_CODES,
  appLanguageMeta,
  CALL_LANGUAGE_CODES,
  callLanguageMeta,
  isSmsReminderLanguage,
  twilioVoiceLocale,
} from "@/lib/languages";
import { voiceSampleScript } from "@/lib/voice-samples";

describe("global reminder languages", () => {
  it("has metadata for every app interface language", () => {
    for (const language of APP_LANGUAGE_CODES) {
      expect(appLanguageMeta(language).nativeName).toBeTruthy();
      expect(appLanguageMeta(language).shortLabel).toMatch(/^\S{2,4}$/);
    }
  });

  it("has metadata for every supported language", () => {
    expect(CALL_LANGUAGE_CODES.length).toBeGreaterThanOrEqual(30);
    for (const language of CALL_LANGUAGE_CODES) {
      expect(callLanguageMeta(language).nativeName).toBeTruthy();
      expect(callLanguageMeta(language).speechLocale).toMatch(/^[a-z]{2,3}-[A-Z]{2,3}$/);
    }
  });

  it("builds complete call scripts and preview samples for every supported language", () => {
    for (const language of CALL_LANGUAGE_CODES) {
      const scripts = buildReminderScripts({
        patientName: "Asha",
        time: "08:00",
        meds: [{ brandName: "Telma 40", doseInstruction: "one tablet" }],
        foodRelation: "after_food",
        language,
      });
      expect(scripts.greetingMedlist).toContain("Telma 40");
      expect(scripts.menu).toContain("1");
      expect(scripts.thanks.length).toBeGreaterThan(20);
      expect(scripts.goodbyeNoinput.length).toBeGreaterThan(20);
      expect(voiceSampleScript(language, "Asha")).toContain("Asha");
      expect(voiceSampleScript(language, "Asha").length).toBeGreaterThan(20);
    }
  });

  it("keeps a generated-audio-only language out of the Twilio <Say> fallback", () => {
    expect(twilioVoiceLocale("sw")).toBeNull();
    expect(twilioVoiceLocale("fr")).toBe("fr-FR");
  });

  it("does not enable an unreviewed SMS language simply because voice supports it", () => {
    expect(isSmsReminderLanguage("hi")).toBe(true);
    expect(isSmsReminderLanguage("sw")).toBe(false);
  });

  it("builds a complete Swahili reminder script with the safety instruction", () => {
    const scripts = buildReminderScripts({
      patientName: "Amina",
      time: "20:00",
      meds: [{ brandName: "Telma 40", doseInstruction: "kidonge kimoja" }],
      foodRelation: "after_food",
      language: "sw",
    });
    expect(scripts.greetingMedlist).toContain("Telma 40");
    expect(scripts.menu).toContain("1");
    expect(scripts.thanks).toContain("daktari au mfamasia");
    expect(voiceSampleScript("ar", "Fatima")).toContain("Fatima");
  });
});
