import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type OpenAiOperation = "llm" | "tts";

const limitFor = (operation: OpenAiOperation) =>
  operation === "llm"
    ? config.openAiDailyLlmRequestLimit
    : config.openAiDailyTtsGenerationLimit;

const dayForBudget = () => DateTime.now().setZone(config.defaultTz).toFormat("yyyy-LL-dd");

/**
 * Atomically reserve one outbound OpenAI request before it leaves the laptop.
 *
 * A failed OpenAI attempt is intentionally still counted: it is the only
 * conservative way to guarantee that retries cannot silently exceed a demo
 * budget. If the budget table itself is unavailable, fail closed and never
 * send the request.
 */
export async function reserveOpenAiRequest(operation: OpenAiOperation): Promise<void> {
  const limit = limitFor(operation);
  const day = dayForBudget();
  const id = `${day}:${operation}`;

  if (limit === 0) {
    throw new AppError(
      "OPENAI_BUDGET_EXCEEDED",
      "This demo is configured not to make OpenAI requests. Use the seeded demo data instead.",
    );
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
      throw new AppError(
        "OPENAI_BUDGET_EXCEEDED",
        "The daily OpenAI demo limit has been reached. Use the seeded demo data or raise the cap deliberately tomorrow.",
      );
    }
    logger.info({ operation, day, limit }, "OpenAI demo request reserved");
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err, operation, day }, "OpenAI budget guard unavailable — blocking request");
    throw new AppError(
      "OPENAI_BUDGET_GUARD_UNAVAILABLE",
      "The local AI budget guard is unavailable. No OpenAI request was sent; run npm run db:push before the demo.",
      err,
    );
  }
}
