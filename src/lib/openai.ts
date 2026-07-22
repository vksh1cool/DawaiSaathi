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

/** TTS stays on OpenAI unless a dedicated NIM Speech deployment is configured. */
export const openAiTts = config.openAiTtsApiKey
  ? new OpenAI({ apiKey: config.openAiTtsApiKey })
  : null;

/**
 * Chat completions are sent with the global `fetch`, NOT the OpenAI SDK's
 * default transport. On the Cloudflare Workers runtime the SDK's Node-http
 * client throws `TypeError: Cannot read properties of null (reading 'has')`
 * inside `processHeader` — so every Groq/NIM/OpenAI text call fails in
 * production. `fetch` is natively supported on Workers (this is exactly how
 * src/lib/gemini.ts talks to Gemini), so it works in both Node and Workers.
 * The OpenAI-compatible chat-completions surface is identical across OpenAI,
 * Groq, and NIM, so one fetch path serves all three.
 */
const CHAT_COMPLETIONS_URL = `${(config.llmBaseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`;

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
        // OpenAI supports strict json_schema; Groq/NIM deployments do not all
        // implement it, so they use json_object mode + the schema-in-prompt
        // hint above. Zod remains the final validation boundary below.
        const responseFormat =
          config.llmProvider === "openai"
            ? {
                type: "json_schema" as const,
                json_schema: {
                  name: schemaName,
                  strict: true,
                  schema: jsonSchema as Record<string, unknown>,
                },
              }
            : { type: "json_object" as const };

        const resp = await fetch(CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.llmApiKey}`,
          },
          body: JSON.stringify({ model, messages, response_format: responseFormat }),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          const e = new Error(
            `${config.llmProvider} ${resp.status}: ${errText.slice(0, 300)}`,
          ) as Error & { status?: number };
          e.status = resp.status;
          throw e;
        }
        const json = (await resp.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        logger.info(
          { service: config.llmProvider, op: schemaName, model, ms: Date.now() - started, ok: true },
          "llm call",
        );
        const text = json.choices?.[0]?.message?.content;
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
