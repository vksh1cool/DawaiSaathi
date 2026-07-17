import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getHousehold: vi.fn(),
  createHousehold: vi.fn(),
  updateHousehold: vi.fn(),
  updatePatient: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ config: { defaultTz: "Asia/Kolkata" } }));
vi.mock("@/lib/household", () => ({ getHousehold: mocked.getHousehold }));
// The legacy-route unit tests deliberately keep AUTH_DRIVER off. Mock the
// staged server-only Supabase modules so Vitest does not load Next's
// server-only sentinel while collecting this D1 compatibility suite.
vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: () => false,
  getRuntimeValue: () => undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    household: { create: mocked.createHousehold },
    $transaction: mocked.transaction,
  },
}));

import { PATCH, POST } from "@/app/api/household/route";

const household = {
  id: "household-1",
  caregiverName: "Priya",
  uiLanguage: "en",
  patients: [
    {
      id: "patient-1",
      name: "Kamla Devi",
      phoneE164: "+919876543210",
      language: "hi",
      voiceGender: "female",
      timezone: "Asia/Kolkata",
    },
  ],
};

describe("household onboarding route", () => {
  beforeEach(() => {
    mocked.getHousehold.mockReset();
    mocked.createHousehold.mockReset();
    mocked.updateHousehold.mockReset();
    mocked.updatePatient.mockReset();
    mocked.transaction.mockReset().mockImplementation(async (handler) =>
      handler({
        household: { update: mocked.updateHousehold },
        patient: { update: mocked.updatePatient },
      }),
    );
  });

  it("creates the onboarding household with the patient's selected call settings", async () => {
    mocked.getHousehold.mockResolvedValueOnce(null);
    mocked.createHousehold.mockResolvedValue(household);

    const response = await POST(request("POST"));

    expect(response.status).toBe(201);
    expect(mocked.createHousehold).toHaveBeenCalledWith({
      data: {
        caregiverName: "Priya",
        uiLanguage: "en",
        patients: {
          create: {
            name: "Kamla Devi",
            phoneE164: "+919876543210",
            language: "hi",
            voiceGender: "female",
            timezone: "Asia/Kolkata",
            smsReminderConsentAt: null,
            smsReminderConsentVersion: null,
          },
        },
      },
      include: { patients: true },
    });
    await expect(response.json()).resolves.toMatchObject({ household: { id: "household-1" } });
  });

  it("preserves a completed onboarding instead of overwriting it from an old tab", async () => {
    mocked.getHousehold.mockResolvedValue(household);

    const response = await POST(request("POST"));

    expect(response.status).toBe(409);
    expect(mocked.createHousehold).not.toHaveBeenCalled();
  });

  it("updates caregiver and voice preferences atomically after setup", async () => {
    const updated = {
      ...household,
      caregiverName: "Updated Priya",
      patients: [{ ...household.patients[0], language: "bn", voiceGender: "male" }],
    };
    mocked.getHousehold.mockResolvedValueOnce(household).mockResolvedValueOnce(updated);

    const response = await PATCH(
      new Request("http://localhost/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caregiverName: "Updated Priya",
          patient: { language: "bn", voiceGender: "male" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.updateHousehold).toHaveBeenCalledWith({
      where: { id: "household-1" },
      data: { caregiverName: "Updated Priya", uiLanguage: undefined },
    });
    expect(mocked.updatePatient).toHaveBeenCalledWith({
      where: { id: "patient-1" },
      data: { language: "bn", voiceGender: "male" },
    });
    await expect(response.json()).resolves.toMatchObject({
      household: { caregiverName: "Updated Priya", patient: { language: "bn", voiceGender: "male" } },
    });
  });

  it("revokes SMS consent when the call language becomes unsupported for SMS", async () => {
    const consentedHousehold = {
      ...household,
      patients: [
        {
          ...household.patients[0],
          smsReminderConsentAt: new Date("2026-07-17T00:00:00.000Z"),
          smsReminderConsentVersion: "2026-07-17",
        },
      ],
    };
    const updated = {
      ...consentedHousehold,
      patients: [{ ...consentedHousehold.patients[0], language: "sw", smsReminderConsentAt: null, smsReminderConsentVersion: null }],
    };
    mocked.getHousehold.mockResolvedValueOnce(consentedHousehold).mockResolvedValueOnce(updated);

    const response = await PATCH(
      new Request("http://localhost/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient: { language: "sw" } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocked.updatePatient).toHaveBeenCalledWith({
      where: { id: "patient-1" },
      data: { language: "sw", smsReminderConsentAt: null, smsReminderConsentVersion: null },
    });
  });

  it("requires a new phone to be saved before SMS consent can be granted again", async () => {
    mocked.getHousehold.mockResolvedValue(household);

    const response = await PATCH(
      new Request("http://localhost/api/household", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient: { phoneE164: "+919876543211", smsReminderConsent: true } }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocked.updatePatient).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION" } });
  });
});

function request(method: "POST") {
  return new Request("http://localhost/api/household", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caregiverName: "Priya",
      uiLanguage: "en",
      patient: {
        name: "Kamla Devi",
        phoneE164: "+919876543210",
        language: "hi",
        voiceGender: "female",
      },
    }),
  });
}
