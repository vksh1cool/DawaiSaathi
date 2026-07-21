import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  apiJson: vi.fn(),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, apiJson: mocked.apiJson };
});
vi.mock("@/lib/util/browser-id", () => ({ randomUuid: () => "00000000-0000-4000-8000-000000000000" }));

import { ApiError } from "@/lib/api-client";
import { seedDemoHousehold } from "@/lib/demo-seed";

describe("seedDemoHousehold", () => {
  beforeEach(() => {
    mocked.apiJson.mockReset();
  });

  it("seeds a household, one medication, and one schedule entry in order", async () => {
    mocked.apiJson
      .mockResolvedValueOnce({ household: { id: "household-1" } })
      .mockResolvedValueOnce({ medications: [{ id: "medication-1" }] })
      .mockResolvedValueOnce({ schedules: [{ id: "schedule-1" }] });

    await seedDemoHousehold("en");

    expect(mocked.apiJson).toHaveBeenCalledTimes(3);

    const [householdUrl, householdMethod, householdBody, householdOptions] = mocked.apiJson.mock.calls[0];
    expect(householdUrl).toBe("/api/household");
    expect(householdMethod).toBe("POST");
    expect(householdBody).toMatchObject({
      caregiverName: "Priya",
      uiLanguage: "en",
      patient: expect.objectContaining({ name: "Kamla Devi", phoneE164: "+911234567890" }),
    });
    expect(householdOptions).toMatchObject({ headers: { "Idempotency-Key": expect.any(String) } });

    const [medicationUrl, medicationMethod, medicationBody] = mocked.apiJson.mock.calls[1];
    expect(medicationUrl).toBe("/api/medications");
    expect(medicationMethod).toBe("POST");
    expect(medicationBody).toMatchObject({
      medications: [expect.objectContaining({ brandName: "Telma 40" })],
    });

    const [scheduleUrl, scheduleMethod, scheduleBody] = mocked.apiJson.mock.calls[2];
    expect(scheduleUrl).toBe("/api/schedules");
    expect(scheduleMethod).toBe("POST");
    expect(scheduleBody).toMatchObject({
      schedules: [expect.objectContaining({ medicationId: "medication-1", times: ["08:00"] })],
    });
  });

  it("continues seeding the medication when the household already exists (CONFLICT)", async () => {
    mocked.apiJson
      .mockRejectedValueOnce(new ApiError("CONFLICT", "already exists"))
      .mockResolvedValueOnce({ medications: [{ id: "medication-1" }] })
      .mockResolvedValueOnce({ schedules: [{ id: "schedule-1" }] });

    await seedDemoHousehold("hi");

    expect(mocked.apiJson).toHaveBeenCalledTimes(3);
  });

  it("never throws when the household seed fails for a non-CONFLICT reason", async () => {
    mocked.apiJson.mockRejectedValueOnce(new ApiError("VALIDATION", "bad request"));

    await expect(seedDemoHousehold("en")).resolves.toBeUndefined();
    expect(mocked.apiJson).toHaveBeenCalledTimes(1);
  });

  it("never throws when the medication seed step fails", async () => {
    mocked.apiJson
      .mockResolvedValueOnce({ household: { id: "household-1" } })
      .mockRejectedValueOnce(new Error("network down"));

    await expect(seedDemoHousehold("en")).resolves.toBeUndefined();
    expect(mocked.apiJson).toHaveBeenCalledTimes(2);
  });

  it("does not call the schedules endpoint when no medication id is returned", async () => {
    mocked.apiJson
      .mockResolvedValueOnce({ household: { id: "household-1" } })
      .mockResolvedValueOnce({ medications: [] });

    await seedDemoHousehold("en");

    expect(mocked.apiJson).toHaveBeenCalledTimes(2);
  });
});
