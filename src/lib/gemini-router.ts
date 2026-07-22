import { getGeminiApiKeys } from "@/lib/cloudflare-runtime";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Multi-key Gemini request router (Arch §8.1 resilience).
 *
 * A single Gemini API key on the free tier is fragile: it hits per-minute rate
 * limits (429), daily quota caps, and intermittent 404/5xx responses. During a
 * live demo that manifests as "AI not available". This router runs the same
 * request across every configured key (see getGeminiApiKeys), rotating to the
 * next key the moment one is exhausted and applying a short backoff for
 * transient errors, so the app keeps working as long as ONE key on ONE attempt
 * succeeds. It throws only when every key and retry is exhausted.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Error carrying the upstream HTTP status so the router can route on it. */
export class GeminiHttpError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Gemini ${status}: ${body.slice(0, 300)}`);
    this.name = "GeminiHttpError";
    this.status = status;
    this.body = body;
  }
}

/** Status where THIS key is unusable right now → rotate to the next key. */
const isKeyExhausted = (status?: number): boolean =>
  status === 401 || status === 403 || status === 429;

/** Status worth retrying on the SAME key after a short backoff. Gemini's free
 * tier returns 404 and empty-candidate 5xx transiently, not just true 429s. */
const isTransient = (status?: number): boolean =>
  status === 404 || status === 429 || status === 408 || (status !== undefined && status >= 500);

const statusOf = (err: unknown): number | undefined =>
  typeof (err as { status?: unknown })?.status === "number"
    ? (err as { status: number }).status
    : undefined;

export type GeminiKeyCall<T> = (key: string, keyIndex: number) => Promise<T>;

export interface RunWithGeminiKeysOptions {
  /** Backoff schedule (ms) for transient retries on a single key. */
  backoffMs?: number[];
}

/**
 * Execute `call(key)` against each configured Gemini key with per-key backoff
 * and automatic rotation.
 *
 *   - success                → return immediately
 *   - 401 / 403 / 429        → key exhausted; rotate to the next key at once
 *   - 404 / 408 / 5xx        → transient; short backoff and retry the same key
 *   - all keys+retries spent → throw the last upstream error
 *
 * `call` should perform exactly one network request with the given key and
 * throw a {@link GeminiHttpError} (or any error carrying `.status`) on failure.
 */
export async function runWithGeminiKeys<T>(
  op: string,
  call: GeminiKeyCall<T>,
  options: RunWithGeminiKeysOptions = {},
): Promise<T> {
  const keys = getGeminiApiKeys();
  if (keys.length === 0) {
    // Callers should gate on geminiEnabledAtRuntime(), but fail loudly rather
    // than sending a keyless request.
    throw new AppError("UPSTREAM_GEMINI", `Gemini is not configured (no key) for ${op}.`);
  }

  const backoffs = options.backoffMs ?? [800, 2500];
  let lastErr: unknown;

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]!;
    const hasNextKey = keyIndex < keys.length - 1;

    for (let attempt = 0; attempt <= backoffs.length; attempt += 1) {
      try {
        return await call(key, keyIndex);
      } catch (err) {
        lastErr = err;
        if (err instanceof AppError) throw err; // budget/validation errors are terminal
        const status = statusOf(err);

        // Hard key failure and another key exists → stop wasting time on this
        // key and rotate immediately.
        if (isKeyExhausted(status) && hasNextKey) {
          logger.warn({ op, keyIndex, status }, "gemini: key exhausted, rotating to next key");
          break;
        }
        // Transient failure with retry budget left → back off and retry same key.
        if (isTransient(status) && attempt < backoffs.length) {
          logger.warn({ op, keyIndex, status, attempt }, "gemini: transient error, retrying same key");
          await sleep(backoffs[attempt]!);
          continue;
        }
        // Nothing more to try on this key. Move to the next key if one exists.
        if (hasNextKey) {
          logger.warn({ op, keyIndex, status }, "gemini: error, trying next key");
          break;
        }
        // Last key, no retry budget → give up.
        break;
      }
    }
  }

  if (lastErr instanceof Error) throw lastErr;
  throw new AppError("UPSTREAM_GEMINI", `Gemini is unavailable for ${op} after all keys were tried.`);
}
