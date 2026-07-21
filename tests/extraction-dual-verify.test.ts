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
import { extractPhoto } from "@/lib/extraction";
import type { ExtractionResult } from "@/lib/prompts";

/**
 * Dual-verify merge tests for medicine-strip extraction (Arch §8.1). Both
 * the primary provider and Gemini are test doubles injected through their
 * real setLLMClient/setGeminiLLMClient hooks, so these exercise the actual
 * callLLMDualVerify + crossCheckExtraction merge logic end-to-end without
 * touching the network or the OpenAI budget guard.
 */

function medication(overrides: Partial<ExtractionResult["medications"][number]> = {}): ExtractionResult["medications"][number] {
  return {
    brandName: "Telma 40",
    composition: [{ saltNameAsPrinted: "Telmisartan", strengthValue: 40, strengthUnit: "mg" }],
    form: "tablet",
    packSize: 30,
    mrpInr: 234,
    expiryDate: "2027-08",
    batchNumber: "B123",
    manufacturer: "Glenmark",
    fieldConfidence: { brandName: 0.95, composition: 0.9, mrpInr: 0.9, expiryDate: 0.9 },
    warnings: [],
    ...overrides,
  };
}

function fakeClient(result: ExtractionResult): LLMClient {
  return { complete: vi.fn().mockResolvedValue(JSON.stringify(result)) };
}

function erroringClient(message: string): LLMClient {
  return { complete: vi.fn().mockRejectedValue(new Error(message)) };
}

describe("dual-verify: extraction cross-check merge", () => {
  afterEach(() => {
    resetLLMClient();
    resetGeminiLLMClient();
  });

  it("(a) keeps the value and confidence when both providers agree on every field", async () => {
    const shared = medication();
    setLLMClient(fakeClient({ medications: [shared], imageIssues: [] }));
    setGeminiLLMClient(fakeClient({ medications: [{ ...shared }], imageIssues: [] }));

    const result = await extractPhoto("data:image/jpeg;base64,x");

    expect(result.medications).toHaveLength(1);
    expect(result.medications[0]).toMatchObject({
      brandName: "Telma 40",
      mrpInr: 234,
      fieldConfidence: { brandName: 0.95, mrpInr: 0.9 },
    });
    expect(result.medications[0].warnings).toEqual([]);
  });

  it("(b) keeps the primary value but lowers fieldConfidence when providers disagree", async () => {
    setLLMClient(fakeClient({ medications: [medication({ mrpInr: 234 })], imageIssues: [] }));
    setGeminiLLMClient(fakeClient({ medications: [medication({ mrpInr: 250 })], imageIssues: [] }));

    const result = await extractPhoto("data:image/jpeg;base64,x");

    expect(result.medications).toHaveLength(1);
    const [merged] = result.medications;
    expect(merged.mrpInr).toBe(234); // primary's value kept
    expect(merged.fieldConfidence.mrpInr).toBeLessThan(0.7); // demoted below the review-UI threshold
    expect(merged.warnings.some((w) => w.toLowerCase().includes("mrp"))).toBe(true);
  });

  it("(b) surfaces (not drops) a medicine only one provider detected, flagged for review", async () => {
    const onlyPrimary = medication({ brandName: "Only Primary" });
    setLLMClient(fakeClient({ medications: [onlyPrimary], imageIssues: [] }));
    setGeminiLLMClient(fakeClient({ medications: [], imageIssues: [] }));

    const result = await extractPhoto("data:image/jpeg;base64,x");

    expect(result.medications).toHaveLength(1);
    expect(result.medications[0].brandName).toBe("Only Primary");
    expect(result.medications[0].fieldConfidence.brandName).toBeLessThan(0.7);
    expect(result.medications[0].warnings.some((w) => w.includes("Only one AI"))).toBe(true);
  });

  it("(c) degrades gracefully to the primary provider's result when Gemini errors", async () => {
    const primaryOnly = medication();
    setLLMClient(fakeClient({ medications: [primaryOnly], imageIssues: [] }));
    setGeminiLLMClient(erroringClient("gemini down"));

    const result = await extractPhoto("data:image/jpeg;base64,x");

    // Gemini unavailable → identical to pre-dual-verify single-provider
    // behavior: primary's fieldConfidence is untouched, no review warning added.
    expect(result.medications).toEqual([primaryOnly]);
  });
});
