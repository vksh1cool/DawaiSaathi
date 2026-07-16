import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  config: { demoMode: true },
  findCall: vi.fn(),
  findEvents: vi.fn(),
  gather: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ config: mocked.config }));
vi.mock("@/lib/db", () => ({
  prisma: {
    reminderCall: { findUnique: mocked.findCall },
    doseEvent: { findMany: mocked.findEvents },
  },
  parseStringArray: (json: string) => JSON.parse(json) as string[],
}));
vi.mock("@/lib/calls", () => ({
  handleGatherResult: mocked.gather,
  finalizeUnconfirmed: mocked.finalize,
}));

import { POST } from "@/app/api/simulate/digits/route";

describe("POST /api/simulate/digits", () => {
  beforeEach(() => {
    mocked.config.demoMode = true;
    mocked.findCall.mockReset();
    mocked.findEvents.mockReset();
    mocked.gather.mockReset();
    mocked.finalize.mockReset();
  });

  it("cannot confirm a live Twilio call through the simulator endpoint", async () => {
    mocked.findCall.mockResolvedValue({ mode: "twilio" });

    const response = await POST(
      new Request("http://localhost/api/simulate/digits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderCallId: "live-call", digits: "1" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mocked.gather).not.toHaveBeenCalled();
  });

  it("is unavailable outside demo mode", async () => {
    mocked.config.demoMode = false;

    const response = await POST(
      new Request("http://localhost/api/simulate/digits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderCallId: "sim-call", digits: "1" }),
      }),
    );

    expect(response.status).toBe(404);
    expect(mocked.findCall).not.toHaveBeenCalled();
  });
});
