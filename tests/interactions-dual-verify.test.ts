import { afterEach, describe, expect, it, vi } from "vitest";

// Force Gemini "on" for this suite regardless of the real environment (the
// vitest env only sets OPENAI_API_KEY). Only geminiEnabled is overridden —
// everything else keeps its real, already-config-validated value.
vi.mock("@/lib/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/config")>();
  return { ...actual, config: { ...actual.config, geminiEnabled: true } };
});

import { resetLLMClient, setLLMClient, type LLMClient } from "@/lib/openai";
import { resetGeminiLLMClient, setGeminiLLMClient } from "@/lib/gemini";
import { runInteractionLLM, type MedSalt } from "@/lib/interactions";

/**
 * Dual-verify merge tests for the drug-interaction safety-critical call
 * (Arch §8.1). Both the primary provider and Gemini are test doubles
 * injected through their real setLLMClient/setGeminiLLMClient hooks, so
 * these exercise the actual callLLMDualVerify + runInteractionLLM merge
 * logic end-to-end without touching the network or the OpenAI budget guard.
 */

const medSalts: MedSalt[] = [
  { medId: "med-aspirin", brand: "Ecosprin", inn: "aspirin", fdaSearchName: "aspirin" },
  { medId: "med-warfarin", brand: "Warf", inn: "warfarin", fdaSearchName: "warfarin" },
];
const meds = [
  { id: "med-aspirin", brandName: "Ecosprin" },
  { id: "med-warfarin", brandName: "Warf" },
];

type RawFinding = {
  saltA: string;
  saltB: string;
  severity: "major" | "moderate" | "minor" | "unverified";
  source: "openfda" | "llm_suspected";
  evidenceQuote: string | null;
  evidenceLabelSalt: string | null;
  explanationEn: string;
  explanationHi: string;
  actionEn: string;
  actionHi: string;
};

const finding = (saltA: string, saltB: string): RawFinding => ({
  saltA,
  saltB,
  severity: "moderate",
  source: "llm_suspected",
  evidenceQuote: null,
  evidenceLabelSalt: null,
  explanationEn: "May increase bleeding risk.",
  explanationHi: "रक्तस्राव का खतरा बढ़ सकता है।",
  actionEn: "Consult your doctor or pharmacist before the next dose.",
  actionHi: "अगली खुराक से पहले डॉक्टर या फार्मासिस्ट से बात करें।",
});

function fakeClient(findings: RawFinding[]): LLMClient {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify({ findings })) };
}

function erroringClient(message: string): LLMClient {
  return { complete: vi.fn().mockRejectedValue(new Error(message)) };
}

describe("dual-verify: interaction cross-check merge", () => {
  afterEach(() => {
    resetLLMClient();
    resetGeminiLLMClient();
  });

  it("(a) marks a finding as agreed when both providers flag the same pair", async () => {
    setLLMClient(fakeClient([finding("aspirin", "warfarin")]));
    setGeminiLLMClient(fakeClient([finding("aspirin", "warfarin")]));

    const result = await runInteractionLLM(meds, medSalts, [], new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ saltA: "aspirin", saltB: "warfarin", bothAgreed: true });
  });

  it("(b) surfaces (not drops) a finding only the primary provider flagged, tagged as disagreed", async () => {
    setLLMClient(fakeClient([finding("aspirin", "warfarin")]));
    setGeminiLLMClient(fakeClient([])); // Gemini responded but found nothing

    const result = await runInteractionLLM(meds, medSalts, [], new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ bothAgreed: false });
  });

  it("(b) surfaces (not drops) a pair only Gemini flagged, tagged as disagreed", async () => {
    setLLMClient(fakeClient([])); // primary responded but found nothing
    setGeminiLLMClient(fakeClient([finding("aspirin", "warfarin")]));

    const result = await runInteractionLLM(meds, medSalts, [], new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ saltA: "aspirin", saltB: "warfarin", bothAgreed: false });
  });

  it("(c) degrades gracefully to the primary provider alone when Gemini errors", async () => {
    setLLMClient(fakeClient([finding("aspirin", "warfarin")]));
    setGeminiLLMClient(erroringClient("gemini down"));

    const result = await runInteractionLLM(meds, medSalts, [], new Map());

    // Gemini unavailable → identical to pre-dual-verify single-provider
    // behavior: the primary finding is used as-is, not demoted.
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ bothAgreed: true });
  });

  it("(c) degrades gracefully to Gemini alone when the primary provider errors", async () => {
    setLLMClient(erroringClient("primary down"));
    setGeminiLLMClient(fakeClient([finding("aspirin", "warfarin")]));

    const result = await runInteractionLLM(meds, medSalts, [], new Map());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ saltA: "aspirin", saltB: "warfarin", bothAgreed: true });
  });
});
