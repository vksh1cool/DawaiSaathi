import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { reserveGeminiRequest } from "@/lib/openai-budget";
import type { LLMClient, LLMCompleteOpts } from "@/lib/openai";

/**
 * Gemini client (Arch §8.1 dual-verify). Gemini cross-checks the two
 * safety-critical LLM calls (drug-interaction checking in
 * src/lib/interactions.ts and strip-photo extraction in src/lib/extraction.ts)
 * — and, because the primary provider (Groq) has no vision model, it is also
 * the effective vision provider: dual-verify falls back to Gemini's result
 * when the primary fails on an image request.
 *
 * This talks to Gemini's NATIVE generateContent endpoint with fetch, not the
 * OpenAI-compatibility shim. Newer Google API keys (the "AQ." format) only
 * authenticate against the native endpoint via the `x-goog-api-key` header —
 * the OpenAI-compat `Authorization: Bearer` path rejects them with 403 — so
 * the native endpoint is the only one that works for both text and vision.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Split a `data:<mime>;base64,<data>` URL into the parts Gemini inline_data needs. */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Unsupported image data URL for Gemini vision.");
  return { mimeType: match[1], data: match[2] };
}

const realGeminiClient: LLMClient = {
  async complete({ system, content, schemaName, jsonSchema }) {
    if (!config.geminiApiKey) {
      // Callers should check config.geminiEnabled before reaching here, but
      // fail loudly rather than silently sending a request with no key.
      throw new AppError("UPSTREAM_OPENAI", "Gemini is not configured (GEMINI_API_KEY missing).");
    }

    // Native Gemini takes a single `contents` array of typed parts.
    const parts = content.map((c) =>
      c.type === "text"
        ? { text: c.text }
        : { inline_data: parseDataUrl(c.dataUrl) },
    );

    const model = config.geminiModel;
    const url = `${GEMINI_BASE}/${model}:generateContent`;
    // Native JSON mode is requested via responseMimeType; the schema is also
    // embedded in the system instruction so the model knows the shape. Zod
    // remains the final validation boundary at the call site.
    const body = {
      system_instruction: {
        parts: [
          {
            text: `${system}\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(jsonSchema, null, 2)}`,
          },
        ],
      },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json" },
    };

    const backoffs = [1000, 4000];
    let lastErr: unknown;
    for (let attempt = 0; attempt <= backoffs.length; attempt++) {
      try {
        // Counts every network attempt, including retries — same
        // conservative accounting as the primary provider's budget guard.
        await reserveGeminiRequest();
        const started = Date.now();

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.geminiApiKey,
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          const e = new Error(`Gemini ${resp.status}: ${errText.slice(0, 300)}`) as Error & { status?: number };
          e.status = resp.status;
          throw e;
        }

        const json = (await resp.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
        logger.info(
          { service: "gemini", op: schemaName, model, ms: Date.now() - started, ok: true },
          "llm call",
        );
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
