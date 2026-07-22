import { geminiEnabledAtRuntime, getGeminiModel } from "@/lib/cloudflare-runtime";
import { AppError } from "@/lib/errors";
import { GeminiHttpError, runWithGeminiKeys } from "@/lib/gemini-router";
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

/** Split a `data:<mime>;base64,<data>` URL into the parts Gemini inline_data needs. */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Unsupported image data URL for Gemini vision.");
  return { mimeType: match[1], data: match[2] };
}

const realGeminiClient: LLMClient = {
  async complete({ system, content, schemaName, jsonSchema }) {
    if (!geminiEnabledAtRuntime()) {
      // Callers should check geminiEnabledAtRuntime() before reaching here, but
      // fail loudly rather than silently sending a request with no key.
      throw new AppError("UPSTREAM_OPENAI", "Gemini is not configured (GEMINI_API_KEY missing).");
    }

    // Native Gemini takes a single `contents` array of typed parts.
    const parts = content.map((c) =>
      c.type === "text"
        ? { text: c.text }
        : { inline_data: parseDataUrl(c.dataUrl) },
    );

    const model = getGeminiModel();
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

    // The router fans this request across every configured key, rotating on
    // rate-limit/quota/auth and backing off on transient errors, so a single
    // exhausted key can't fail a live scan or interaction check.
    try {
      return await runWithGeminiKeys(schemaName, async (key, keyIndex) => {
        // Counts every network attempt, including retries and key rotations —
        // same conservative accounting as the primary provider's budget guard.
        await reserveGeminiRequest();
        const started = Date.now();

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify(body),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new GeminiHttpError(resp.status, errText);
        }

        const json = (await resp.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
        if (!text) {
          // An empty completion (finishReason OTHER/SAFETY) is transient on the
          // free tier — surface as a retryable 5xx so the router retries/rotates.
          throw new GeminiHttpError(503, "Empty completion");
        }
        logger.info(
          { service: "gemini", op: schemaName, model, keyIndex, ms: Date.now() - started, ok: true },
          "llm call",
        );
        return text;
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(
        "UPSTREAM_OPENAI",
        "The Gemini cross-check service is temporarily unavailable.",
        err,
      );
    }
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
