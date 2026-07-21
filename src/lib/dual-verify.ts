import type { z } from "zod";
import { callLLM, stripFences, type LLMCompleteOpts } from "@/lib/openai";
import { completeGemini } from "@/lib/gemini";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Dual-verify (Arch §8.1): for safety-critical calls ONLY (drug-interaction
 * checking in src/lib/interactions.ts and strip-photo extraction in
 * src/lib/extraction.ts), call the existing configured provider (AI_PROVIDER)
 * AND Gemini concurrently for the same prompt/schema, so the two independent
 * models can be cross-checked. Every other `callLLM(...)` call site
 * (schedule suggestion, normalization, etc.) is untouched and keeps using the
 * single configured provider exactly as before — doubling every call would
 * blow through the small daily LLM request budget.
 *
 * This function only fetches+validates both raw results; each call site
 * implements its own merge policy (interactions: only "confirmed" when both
 * models flag the same pair; extraction: per-field agree/disagree) because
 * the right way to reconcile disagreement is schema-specific.
 *
 * Budget: the primary provider call always spends exactly one
 * OPENAI_DAILY_LLM_REQUEST_LIMIT slot, same as a plain callLLM() call today.
 * Gemini spends one GEMINI_DAILY_LLM_REQUEST_LIMIT slot — a separate,
 * smaller cap — only when it is configured. A dual-verify call therefore
 * never doubles consumption against the primary provider's budget.
 */
export type DualVerifyResult<T> = {
  /** Always present — the existing configured provider's validated result. */
  primary: T;
  /** Gemini's validated result, or null when unconfigured/errored (graceful degradation). */
  secondary: T | null;
  /** True only when both providers returned a validated result. */
  bothSucceeded: boolean;
};

export async function callLLMDualVerify<T>(
  opts: LLMCompleteOpts & { zodSchema: z.ZodType<T> },
): Promise<DualVerifyResult<T>> {
  const { zodSchema, ...rest } = opts;
  const primaryPromise = callLLM(opts);

  if (!config.geminiEnabled) {
    // Gemini not configured — identical to single-provider behavior.
    const primary = await primaryPromise;
    return { primary, secondary: null, bothSucceeded: false };
  }

  const secondaryPromise = (async (): Promise<T> => {
    const raw = await completeGemini(rest);
    return zodSchema.parse(JSON.parse(stripFences(raw)));
  })();

  const [primaryOutcome, secondaryOutcome] = await Promise.allSettled([primaryPromise, secondaryPromise]);

  if (primaryOutcome.status === "rejected") {
    // Primary is the request's normal source of truth. If it failed but
    // Gemini succeeded, don't fail the whole request — use Gemini's result
    // alone rather than making dual-verify a new single point of failure.
    if (secondaryOutcome.status === "fulfilled") {
      logger.warn(
        { err: primaryOutcome.reason, schemaName: rest.schemaName },
        "dual-verify: primary provider failed, using Gemini result alone",
      );
      return { primary: secondaryOutcome.value, secondary: null, bothSucceeded: false };
    }
    throw primaryOutcome.reason;
  }

  if (secondaryOutcome.status === "rejected") {
    logger.warn(
      { err: secondaryOutcome.reason, schemaName: rest.schemaName },
      "dual-verify: Gemini cross-check failed, using primary provider result alone",
    );
    return { primary: primaryOutcome.value, secondary: null, bothSucceeded: false };
  }

  return { primary: primaryOutcome.value, secondary: secondaryOutcome.value, bothSucceeded: true };
}
