import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { openAiBudget: db },
}));

import { reserveOpenAiRequest } from "@/lib/openai-budget";

describe("local OpenAI budget guard", () => {
  beforeEach(() => {
    db.upsert.mockReset().mockResolvedValue({});
    db.updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  it("creates a daily category row and conditionally reserves one request", async () => {
    await reserveOpenAiRequest("llm");

    expect(db.upsert).toHaveBeenCalledOnce();
    expect(db.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ requests: { lt: 12 } }),
        data: { requests: { increment: 1 } },
      }),
    );
  });

  it("fails closed once the cap has no remaining slot", async () => {
    db.updateMany.mockResolvedValue({ count: 0 });

    await expect(reserveOpenAiRequest("tts")).rejects.toMatchObject({
      code: "OPENAI_BUDGET_EXCEEDED",
    });
  });

  it("blocks outbound AI work when the guard cannot read its local table", async () => {
    db.upsert.mockRejectedValue(new Error("no such table"));

    await expect(reserveOpenAiRequest("llm")).rejects.toMatchObject({
      code: "OPENAI_BUDGET_GUARD_UNAVAILABLE",
    });
  });
});
