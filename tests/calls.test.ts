import { describe, it, expect } from "vitest";
import { getAudioSet } from "@/lib/calls";
import { buildReminderScripts } from "@/lib/ivr/scripts";

describe("IVR Call and Webhook Handling", () => {
  it("builds a Hindi reminder without revealing the medicine's indication", () => {
    const scripts = buildReminderScripts({
      patientName: "Kamla",
      time: "20:00",
      meds: [
        { brandName: "Glycomet 500", count: 1, form: "tablet" },
        { brandName: "Warf 5", count: 1, form: "tablet" },
      ],
      foodRelation: "after_food",
      language: "hi",
      caregiverName: "Priya",
    });

    expect(scripts.greetingMedlist).toContain("Glycomet 500 की एक गोली");
    expect(scripts.greetingMedlist).toContain("Warf 5 की एक गोली");
    expect(scripts.greetingMedlist).toContain("खाने के बाद");
    expect(scripts.greetingMedlist).not.toMatch(/शुगर|बीपी|बीमारी/);
  });

  it("ends both confirmation and no-input audio with the safety consult line", () => {
    const scripts = buildReminderScripts({
      patientName: "Kamla",
      time: "08:00",
      meds: [{ brandName: "Telma 40", count: 1, form: "tablet" }],
      foodRelation: "any",
      language: "en",
    });

    expect(scripts.thanks).toContain("doctor or pharmacist");
    expect(scripts.goodbyeNoinput).toContain("doctor or pharmacist");
  });

  it("keeps a patient's language for the Twilio <Say> fallback when cached audio is unavailable", () => {
    const audio = getAudioSet({
      id: "call-hi",
      audioFile: JSON.stringify({
        language: "hi",
        medlist: null,
        menu: null,
        thanks: null,
        noinput: null,
        fallback: {
          medlist: "नमस्ते कमला जी।",
          menu: "दवाई लेने के बाद 1 दबाएँ।",
          thanks: "आपकी दवाई दर्ज हो गई है।",
          noinput: "हम थोड़ी देर में फिर फ़ोन करेंगे।",
        },
      }),
    } as never);

    expect(audio.language).toBe("hi");
    expect(audio.medlist).toBeNull();
    expect(audio.fallback.menu).toContain("1 दबाएँ");
  });
});
