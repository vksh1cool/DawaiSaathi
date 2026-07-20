import { describe, expect, it } from "vitest";
import { applyGenderedVoice, pickVoice } from "@/lib/speech";

// SpeechSynthesisVoice / SpeechSynthesisUtterance are DOM types that erase at
// runtime, so the pure selection logic can be exercised with plain fakes.
const voice = (name: string, lang: string): SpeechSynthesisVoice =>
  ({ name, lang, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

const utterance = (): SpeechSynthesisUtterance =>
  ({ pitch: 1, rate: 1, voice: null }) as unknown as SpeechSynthesisUtterance;

describe("gendered speech-synthesis fallback", () => {
  it("prefers a locale voice whose name reveals the requested gender", () => {
    const voices = [
      voice("Microsoft Ravi - Hindi (India)", "hi-IN"),
      voice("Microsoft Heera - Hindi (India)", "hi-IN"),
    ];
    expect(pickVoice(voices, "hi-IN", "female")?.name).toContain("Heera");
    expect(pickVoice(voices, "hi-IN", "male")?.name).toContain("Ravi");
  });

  it("prefers an exact locale match over a language-only match", () => {
    const voices = [voice("Samantha", "en-US"), voice("Rishi", "en-IN")];
    // Both are language matches for en-IN; the exact en-IN voice wins.
    expect(pickVoice(voices, "en-IN", "male")?.name).toBe("Rishi");
  });

  it("falls back to any locale match when no name reveals gender", () => {
    const voices = [voice("Google हिन्दी", "hi-IN")];
    expect(pickVoice(voices, "hi-IN", "female")?.name).toBe("Google हिन्दी");
    expect(pickVoice(voices, "hi-IN", "male")?.name).toBe("Google हिन्दी");
  });

  it("returns null when no voice matches the locale", () => {
    expect(pickVoice([voice("Samantha", "en-US")], "ta-IN", "female")).toBeNull();
  });

  it("makes female and male audibly distinct even with a single un-gendered voice", () => {
    // This is the regression guard for the reported "male and female sound the
    // same" bug: with one shared voice the pitch cue must still separate them.
    const voices = [voice("Google हिन्दी", "hi-IN")];
    const female = utterance();
    const male = utterance();
    applyGenderedVoice(female, "hi-IN", "female", voices);
    applyGenderedVoice(male, "hi-IN", "male", voices);
    expect(female.voice?.name).toBe(male.voice?.name); // same underlying voice
    expect(female.pitch).not.toBe(male.pitch); // …but distinct pitch
    expect(female.pitch).toBeGreaterThan(male.pitch);
  });

  it("assigns the gender-matched voice and a natural pitch when one exists", () => {
    const voices = [
      voice("Microsoft Ravi - Hindi (India)", "hi-IN"),
      voice("Microsoft Heera - Hindi (India)", "hi-IN"),
    ];
    const female = utterance();
    applyGenderedVoice(female, "hi-IN", "female", voices);
    expect(female.voice?.name).toContain("Heera");
    // A matched voice only needs a gentle nudge, not the strong fallback shift.
    expect(female.pitch).toBeGreaterThan(1);
    expect(female.pitch).toBeLessThan(1.35);
  });

  it("keeps pitch within the valid 0–2 SpeechSynthesis range for both genders", () => {
    for (const gender of ["female", "male"] as const) {
      const u = utterance();
      applyGenderedVoice(u, "ta-IN", gender, []);
      expect(u.pitch).toBeGreaterThan(0);
      expect(u.pitch).toBeLessThanOrEqual(2);
    }
  });
});
