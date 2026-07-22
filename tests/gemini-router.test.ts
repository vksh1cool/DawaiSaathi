import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ getGeminiApiKeys: vi.fn() }));

vi.mock("@/lib/cloudflare-runtime", () => ({
  getGeminiApiKeys: runtime.getGeminiApiKeys,
}));

import { GeminiHttpError, runWithGeminiKeys } from "@/lib/gemini-router";
import { AppError } from "@/lib/errors";

// No real backoff waits in tests.
const NO_BACKOFF = { backoffMs: [0, 0, 0] };

describe("gemini failover router", () => {
  beforeEach(() => {
    runtime.getGeminiApiKeys.mockReset().mockReturnValue(["KEY_A", "KEY_B"]);
  });

  it("returns the first key's result without touching the second key", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    const result = await runWithGeminiKeys("test", call, NO_BACKOFF);
    expect(result).toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("KEY_A", 0);
  });

  it("rotates to the second key when the first is rate-limited (429)", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GeminiHttpError(429, "rate limited"))
      .mockResolvedValueOnce("from-b");
    const result = await runWithGeminiKeys("test", call, NO_BACKOFF);
    expect(result).toBe("from-b");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["KEY_A", "KEY_B"]);
  });

  it("rotates to the second key on a hard auth failure (403) without retrying the first", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GeminiHttpError(403, "forbidden"))
      .mockResolvedValueOnce("from-b");
    const result = await runWithGeminiKeys("test", call, NO_BACKOFF);
    expect(result).toBe("from-b");
    // 403 on the first key must NOT be retried on the same key — one call each.
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("retries the same key on a transient 404 before succeeding", async () => {
    runtime.getGeminiApiKeys.mockReturnValue(["ONLY_KEY"]);
    const call = vi
      .fn()
      .mockRejectedValueOnce(new GeminiHttpError(404, "transient"))
      .mockResolvedValueOnce("recovered");
    const result = await runWithGeminiKeys("test", call, NO_BACKOFF);
    expect(result).toBe("recovered");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["ONLY_KEY", "ONLY_KEY"]);
  });

  it("throws the last upstream error when every key is exhausted", async () => {
    const call = vi.fn().mockRejectedValue(new GeminiHttpError(429, "all capped"));
    await expect(runWithGeminiKeys("test", call, NO_BACKOFF)).rejects.toThrow(/429/);
  });

  it("fails fast with an AppError when no keys are configured", async () => {
    runtime.getGeminiApiKeys.mockReturnValue([]);
    const call = vi.fn();
    await expect(runWithGeminiKeys("test", call, NO_BACKOFF)).rejects.toBeInstanceOf(AppError);
    expect(call).not.toHaveBeenCalled();
  });

  it("propagates a terminal AppError (e.g. budget exceeded) without rotating keys", async () => {
    const call = vi.fn().mockRejectedValue(new AppError("OPENAI_BUDGET_EXCEEDED", "no budget"));
    await expect(runWithGeminiKeys("test", call, NO_BACKOFF)).rejects.toBeInstanceOf(AppError);
    // Budget is a hard stop — do not burn the second key on it.
    expect(call).toHaveBeenCalledTimes(1);
  });
});
