import OpenAI from "openai";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reserveGeminiRequest } from "@/lib/openai-budget";
import type { LLMClient, LLMCompleteOpts } from "@/lib/openai";

/**
 * Gemini client (Arch §8.1 dual-verify). Gemini is used ONLY as the second
 * provider to cross-check the two safety-critical LLM calls (drug-interaction
 * checking in src/lib/interactions.ts and strip-photo extraction in
 * src/lib/extraction.ts) — every other call site keeps using the single
 * AI_PROVIDER-selected client exactly as before.
 *
 * Gemini's OpenAI-compatibility endpoint supports the chat-completions API
 * (including json_object response mode), so this reuses the `openai` npm SDK
 * with a baseURL override instead of adding the @google/generative-ai
 * package — the same pattern src/lib/openai.ts already uses for NIM/Groq.
 */

const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export const geminiOpenAi = config.geminiApiKey
  ? new OpenAI({ apiKey: config.geminiApiKey, baseURL: GEMINI_OPENAI_BASE_URL })
  : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const realGeminiClient: LLMClient = {
  async complete({ system, content, schemaName, jsonSchema }) {
    if (!geminiOpenAi) {
      // Callers should check config.geminiEnabled before reaching here, but
      // fail loudly rather than silently sending a request with no key.
      throw new AppError("UPSTREAM_OPENAI", "Gemini is not configured (GEMINI_API_KEY missing).");
    }

    const userParts = content.map((c) =>
      c.type === "text"
        ? { type: "text" as const, text: c.text }
        : { type: "image_url" as const, image_url: { url: c.dataUrl } },
    );

    const model = config.geminiModel;
    const backoffs = [1000, 4000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        // Counts every network attempt, including retries — same
        // conservative accounting as the primary provider's budget guard.
        await reserveGeminiRequest();
        const started = Date.now();

        // Gemini's OpenAI-compat endpoint does not reliably guarantee
        // OpenAI's strict json_schema mode for every model, so — like the
        // NIM/Groq path — use json_object mode with the schema embedded in
        // the system prompt. Zod remains the final validation boundary.
        const jsonHint = `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`;
        const messages = [
          { role: "system" as const, content: system + jsonHint },
          { role: "user" as const, content: userParts },
        ];
        const resp = await geminiOpenAi.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
        });
        logger.info(
          { service: "gemini", op: schemaName, model, ms: Date.now() - started, ok: true },
          "llm call",
        );
        const text = resp.choices[0]?.message?.content;
        if (!text) throw new Error("Empty completion");
        return text;
      } catch (err) {
        if (err instanceof AppError) throw err;
        lastErr = err;
        const status = (err as { status?: number })?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500) || status === undefined;
        if (attempt < backoffs.length && retryable) {
          logger.warn({ service: "gemini", op: schemaName, status, attempt }, "llm retry");
          await sleep(backoffs[attempt]);
          continue;
        }
        break;
      }
    }
    throw new AppError(
      "UPSTREAM_OPENAI",
      "The Gemini cross-check service is temporarily unavailable.",
      lastErr,
    );
  },
};

let client: LLMClient = realGeminiClient;

/** Test hook: swap the Gemini LLM client. */
export function setGeminiLLMClient(c: LLMClient) {
  client = c;
}
export function resetGeminiLLMClient() {
  client = realGeminiClient;
}

/** Raw Gemini completion (no zod validation) — used by callLLMDualVerify. */
export async function completeGemini(opts: LLMCompleteOpts): Promise<string> {
  return client.complete(opts);
}
