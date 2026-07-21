import OpenAI from "openai";
import type { z } from "zod";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reserveOpenAiRequest } from "@/lib/openai-budget";

/**
 * OpenAI client + structured-output wrapper (Arch §8.1).
 * The LLM call is injectable so tests never hit the network.
 */

/** OpenAI SDK also speaks the OpenAI-compatible NIM chat-completions API. */
export const openai = new OpenAI({
  apiKey: config.llmApiKey,
  ...(config.llmBaseUrl ? { baseURL: config.llmBaseUrl } : {}),
});

/** TTS stays on OpenAI unless a dedicated NIM Speech deployment is configured. */
export const openAiTts = config.openAiTtsApiKey
  ? new OpenAI({ apiKey: config.openAiTtsApiKey })
  : null;

export type LLMText = { type: "text"; text: string };
export type LLMImage = { type: "image"; dataUrl: string };
export type LLMContent = LLMText | LLMImage;

export interface LLMCompleteOpts {
  system: string;
  content: LLMContent[];
  schemaName: string;
  jsonSchema: object;
}

export interface LLMClient {
  complete(opts: LLMCompleteOpts): Promise<string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const realClient: LLMClient = {
  async complete({ system, content, schemaName, jsonSchema }) {
    const userParts = content.map((c) =>
      c.type === "text"
        ? { type: "text" as const, text: c.text }
        : { type: "image_url" as const, image_url: { url: c.dataUrl } },
    );

    const hasImages = content.some((c) => c.type === "image");
    // Use the vision model when the request includes images (matters for Groq
    // where the vision model is a separate deployment).
    const model = hasImages ? config.llmVisionModel : config.llmModel;

    const backoffs = [1000, 4000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        // Count every actual network attempt, including a retry. This is more
        // conservative than a cost estimate and makes the local demo cap a
        // true stop rather than merely an after-the-fact usage alert.
        await reserveOpenAiRequest("llm");
        const started = Date.now();

        // For non-OpenAI providers (Groq, NIM), we can't rely on strict
        // json_schema response format. Instead use json_object mode and
        // include the schema in the system prompt so the model knows the
        // expected structure.
        const jsonHint =
          config.llmProvider !== "openai"
            ? `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`
            : "";

        const messages = [
          { role: "system" as const, content: system + jsonHint },
          { role: "user" as const, content: userParts },
        ];
        const resp = await openai.chat.completions.create(
          config.llmProvider === "openai"
            ? {
                model,
                messages,
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: schemaName,
                    strict: true,
                    schema: jsonSchema as Record<string, unknown>,
                  },
                },
              }
            : {
                // Groq and NIM expose the chat-completions surface, but
                // deployed models do not all implement OpenAI's strict
                // JSON-schema response format. We use json_object mode
                // and the schema is included in the system prompt above.
                // Zod remains the final validation boundary below.
                model,
                messages,
                response_format: { type: "json_object" },
              },
        );
        logger.info(
          { service: config.llmProvider, op: schemaName, model, ms: Date.now() - started, ok: true },
          "llm call",
        );
        const text = resp.choices[0]?.message?.content;
        if (!text) throw new Error("Empty completion");
        return text;
      } catch (err) {
        // Budget errors are intentional product decisions, not transient
        // upstream failures. Retrying them would defeat the hard cap.
        if (err instanceof AppError) throw err;
        lastErr = err;
        const status = (err as { status?: number })?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500) || status === undefined;
        if (attempt < backoffs.length && retryable) {
          logger.warn({ service: config.llmProvider, op: schemaName, status, attempt }, "llm retry");
          await sleep(backoffs[attempt]);
          continue;
        }
        break;
      }
    }
    throw new AppError("UPSTREAM_OPENAI", "The AI service is temporarily unavailable.", lastErr);
  },
};

let client: LLMClient = realClient;

/** Test hook: swap the LLM client. */
export function setLLMClient(c: LLMClient) {
  client = c;
}
export function resetLLMClient() {
  client = realClient;
}

/**
 * Call the LLM with a strict JSON schema and validate the result with zod.
 * On a zod parse failure, retries once (the model occasionally emits stray text).
 */
export async function callLLM<T>(opts: LLMCompleteOpts & { zodSchema: z.ZodType<T> }): Promise<T> {
  const { zodSchema, ...rest } = opts;
  let raw = await client.complete(rest);
  try {
    return zodSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    logger.warn({ op: rest.schemaName }, "LLM output failed validation — repair retry");
    raw = await client.complete(rest);
    return zodSchema.parse(JSON.parse(stripFences(raw)));
  }
}

/** Defensive: strip ```json fences if a model wraps output. Exported for reuse by dual-verify. */
export function stripFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  }
  return trimmed;
}
