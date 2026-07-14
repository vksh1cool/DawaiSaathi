import OpenAI from "openai";
import type { z } from "zod";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * OpenAI client + structured-output wrapper (Arch §8.1).
 * The LLM call is injectable so tests never hit the network.
 */

export const openai = new OpenAI({ apiKey: config.openaiApiKey });

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

    const backoffs = [1000, 4000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        const started = Date.now();
        const resp = await openai.chat.completions.create({
          model: config.openaiModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userParts },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: schemaName,
              strict: true,
              schema: jsonSchema as Record<string, unknown>,
            },
          },
        });
        logger.info(
          { service: "openai", op: schemaName, ms: Date.now() - started, ok: true },
          "llm call",
        );
        const text = resp.choices[0]?.message?.content;
        if (!text) throw new Error("Empty completion");
        return text;
      } catch (err) {
        lastErr = err;
        const status = (err as { status?: number })?.status;
        const retryable = status === 429 || (status !== undefined && status >= 500) || status === undefined;
        if (attempt < backoffs.length && retryable) {
          logger.warn({ service: "openai", op: schemaName, status, attempt }, "llm retry");
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

/** Defensive: strip ```json fences if a model wraps output. */
function stripFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
  }
  return trimmed;
}
