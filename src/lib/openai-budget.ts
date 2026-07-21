import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type OpenAiOperation = "llm" | "tts";
/** Gemini is tracked as its own budget row/category — see reserveGeminiRequest. */
type BudgetOperation = OpenAiOperation | "gemini_llm";

const limitFor = (operation: BudgetOperation) =>
  operation === "llm"
    ? config.openAiDailyLlmRequestLimit
    : operation === "gemini_llm"
      ? config.geminiDailyLlmRequestLimit
      : config.openAiDailyTtsGenerationLimit;

const dayForBudget = () => DateTime.now().setZone(config.defaultTz).toFormat("yyyy-LL-dd");

/**
 * Atomically reserve one outbound request of `operation` before it leaves
 * the laptop, using a shared per-day/per-category counter row.
 *
 * A failed attempt is intentionally still counted: it is the only
 * conservative way to guarantee that retries cannot silently exceed a demo
 * budget. If the budget table itself is unavailable, fail closed and never
 * send the request.
 */
async function reserveBudget(
  operation: BudgetOperation,
  exceededMessage: string,
  guardUnavailableMessage: string,
): Promise<void> {
  const limit = limitFor(operation);
  const day = dayForBudget();
  const id = `${day}:${operation}`;

  if (limit === 0) {
    throw new AppError("OPENAI_BUDGET_EXCEEDED", exceededMessage);
  }

  try {
    // The row is created once per day/category. The conditional increment is
    // the ownership claim: two app processes cannot both consume the final
    // remaining request.
    await prisma.openAiBudget.upsert({
      where: { id },
      create: { id, day, operation, requests: 0 },
      update: { updatedAt: new Date() },
    });
    const claim = await prisma.openAiBudget.updateMany({
      where: { id, requests: { lt: limit } },
      data: { requests: { increment: 1 } },
    });
    if (claim.count !== 1) {
      throw new AppError("OPENAI_BUDGET_EXCEEDED", exceededMessage);
    }
    logger.info({ operation, day, limit }, "AI provider request reserved");
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, operation, day }, "AI provider budget guard unavailable — blocking request");
    throw new AppError("OPENAI_BUDGET_GUARD_UNAVAILABLE", guardUnavailableMessage, err);
  }
}

export async function reserveOpenAiRequest(operation: OpenAiOperation): Promise<void> {
  return reserveBudget(
    operation,
    "This demo is configured not to make OpenAI requests. Use the seeded demo data instead.",
    "The local AI budget guard is unavailable. No OpenAI request was sent; run npm run db:push before the demo.",
  );
}

/**
 * Separate, smaller daily cap for the Gemini cross-check calls used by
 * dual-verify (Arch: safety-critical interactions + extraction). Tracked
 * independently from OPENAI_DAILY_LLM_REQUEST_LIMIT so a dual-verify call
 * never doubles consumption against the primary provider's budget — it
 * spends exactly one primary-provider slot (as it always did) plus, only
 * when Gemini is configured, one slot from this cap.
 */
export async function reserveGeminiRequest(): Promise<void> {
  return reserveBudget(
    "gemini_llm",
    "This demo is configured not to make Gemini cross-check requests today. The primary provider result is used alone.",
    "The local AI budget guard is unavailable. No Gemini request was sent.",
  );
}
