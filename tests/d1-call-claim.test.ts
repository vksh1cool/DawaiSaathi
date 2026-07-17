import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  updateMany: vi.fn(),
  createCall: vi.fn(),
  findCalls: vi.fn(),
  findEvents: vi.fn(),
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/config", () => ({ config: { retryDelayMinutes: 10 } }));
vi.mock("@/lib/logger", () => ({ logger: mocked.logger }));

vi.mock("@/lib/db", () => ({
  prisma: {
    doseEvent: { updateMany: mocked.updateMany, findMany: mocked.findEvents },
    reminderCall: { create: mocked.createCall, findMany: mocked.findCalls },
  },
  parseStringArray: (value: string) => JSON.parse(value) as string[],
}));

import { claimAndCreateCallOnD1, releaseOrphanedCallClaims } from "@/lib/calls";

const callData = {
  patientId: "patient-1",
  scheduledAtUtc: new Date("2026-07-17T08:00:00.000Z"),
  doseEventIdsJson: JSON.stringify(["dose-1", "dose-2"]),
  attempt: 1,
  mode: "twilio" as const,
  audioFile: "{}",
};

describe("D1 reminder call claim", () => {
  beforeEach(() => {
    mocked.updateMany.mockReset();
    mocked.createCall.mockReset();
    mocked.findCalls.mockReset();
    mocked.findEvents.mockReset();
  });

  it("creates a call only after one compare-and-set claim wins every dose", async () => {
    mocked.updateMany.mockResolvedValue({ count: 2 });
    mocked.createCall.mockResolvedValue({ id: "call-1" });

    await expect(claimAndCreateCallOnD1("patient-1", ["dose-1", "dose-2"], callData)).resolves.toEqual({ id: "call-1" });

    expect(mocked.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["dose-1", "dose-2"] }, patientId: "patient-1", status: "scheduled" },
      data: { status: "calling", nextAttemptAtUtc: null },
    });
    expect(mocked.createCall).toHaveBeenCalledWith({ data: callData });
  });

  it("does not create a second call when another worker already claimed a dose", async () => {
    mocked.updateMany.mockResolvedValue({ count: 1 });

    await expect(claimAndCreateCallOnD1("patient-1", ["dose-1", "dose-2"], callData)).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mocked.createCall).not.toHaveBeenCalled();
  });

  it("releases a claim when persisting its call record fails", async () => {
    mocked.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 2 });
    mocked.createCall.mockRejectedValue(new Error("D1 unavailable"));

    await expect(claimAndCreateCallOnD1("patient-1", ["dose-1", "dose-2"], callData)).rejects.toThrow("D1 unavailable");

    expect(mocked.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: { in: ["dose-1", "dose-2"] }, patientId: "patient-1", status: "calling" },
        data: expect.objectContaining({ status: "scheduled" }),
      }),
    );
  });

  it("releases only an expired claim that does not belong to an open call", async () => {
    const cutoff = new Date("2026-07-17T08:05:00.000Z");
    mocked.findCalls.mockResolvedValue([{ doseEventIdsJson: JSON.stringify(["dose-live"]) }]);
    mocked.findEvents.mockResolvedValue([{ id: "dose-live" }, { id: "dose-orphan" }]);
    mocked.updateMany.mockResolvedValue({ count: 1 });

    await releaseOrphanedCallClaims(cutoff);

    expect(mocked.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["dose-orphan"] },
        status: "calling",
        updatedAt: { lt: cutoff },
      },
      data: expect.objectContaining({ status: "scheduled" }),
    });
  });
});
