import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  transaction: vi.fn(),
  claimBatch: vi.fn(),
  createMedication: vi.fn(),
  confirmBatch: vi.fn(),
  getPatient: vi.fn(),
  createData: vi.fn(),
  serialize: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: mocked.transaction },
}));
vi.mock("@/lib/household", () => ({ getPatientOrThrow: mocked.getPatient }));
vi.mock("@/lib/medications", () => ({
  draftToCreateData: mocked.createData,
  serializeMedication: mocked.serialize,
}));

import { POST } from "@/app/api/medications/route";

const draft = {
  tempId: "draft-1",
  brandName: "Telma 40",
  salts: [{ inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" }],
  form: "tablet",
  packSize: 30,
  mrpInr: 234,
  expiryDate: null,
  batchNumber: null,
  manufacturer: null,
  fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
  warnings: [],
  highRisk: false,
  highRiskReason: null,
  usualFrequencyHint: null,
  displayGeneric: "telmisartan",
};

describe("POST /api/medications scan confirmation", () => {
  beforeEach(() => {
    mocked.claimBatch.mockReset();
    mocked.createMedication.mockReset();
    mocked.confirmBatch.mockReset();
    mocked.getPatient.mockReset().mockResolvedValue({ id: "patient-1" });
    mocked.createData.mockReset().mockReturnValue({ patientId: "patient-1" });
    mocked.serialize.mockReset().mockImplementation((medication) => medication);
    mocked.transaction.mockReset().mockImplementation(async (handler) =>
      handler({
        scanBatch: { updateMany: mocked.claimBatch, update: mocked.confirmBatch },
        medication: { create: mocked.createMedication },
      }),
    );
  });

  it("does not create medicines when another confirmation has already claimed the scan", async () => {
    mocked.claimBatch.mockResolvedValue({ count: 0 });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocked.createMedication).not.toHaveBeenCalled();
  });

  it("claims, persists, and confirms a scan in one transaction", async () => {
    mocked.claimBatch.mockResolvedValue({ count: 1 });
    mocked.createMedication.mockResolvedValue({ id: "med-1" });
    mocked.confirmBatch.mockResolvedValue({ id: "scan-1" });

    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocked.claimBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "scan-1", patientId: "patient-1", status: "extracted" }),
        data: { status: "confirming" },
      }),
    );
    expect(mocked.confirmBatch).toHaveBeenCalledWith({
      where: { id: "scan-1" },
      data: { status: "confirmed" },
    });
  });
});

function request() {
  return new Request("http://localhost/api/medications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanBatchId: "scan-1", medications: [draft] }),
  });
}
