import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));

import {
  archiveSupabaseMedication,
  createSupabaseMedications,
  listSupabaseMedications,
  updateSupabaseMedication,
} from "@/lib/supabase/medications";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import type { DraftMedication } from "@/types/domain";

type QueryResponse = {
  data?: unknown;
  error?: { code?: string } | null;
};

class SupabaseQuery {
  readonly filters: { method: "eq" | "gte"; column: string; value: unknown }[] = [];
  operation: "insert" | "select" | "update" | null = null;
  payload: unknown;
  selectedColumns: string | null = null;
  orderBy: { column: string; ascending?: boolean } | null = null;
  limitCount: number | null = null;

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {}

  insert(payload: unknown) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  select(columns: string) {
    if (!this.operation) this.operation = "select";
    this.selectedColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ method: "gte", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.response);
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.response).then(onfulfilled, onrejected);
  }
}

function createMockSupabase(responses: QueryResponse[]) {
  const queries: SupabaseQuery[] = [];
  const rpcCalls: { functionName: string; args: Record<string, unknown> }[] = [];
  return {
    queries,
    rpcCalls,
    from: vi.fn((table: string) => {
      const query = new SupabaseQuery(table, responses[queries.length] ?? { data: null, error: null });
      queries.push(query);
      return query;
    }),
    rpc: vi.fn((functionName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ functionName, args });
      return Promise.resolve(responses[queries.length + rpcCalls.length - 1] ?? { data: null, error: null });
    }),
  };
}

const tenant = {
  id: "household-1",
  caregiverName: "Priya",
  uiLanguage: "en",
  patient: {
    id: "patient-1",
    name: "Kamla Devi",
    phoneE164: "+919876543210",
    language: "hi",
    voiceGender: "female" as const,
    timezone: "Asia/Kolkata",
    smsReminderConsent: true,
  },
};

const medicationRow = {
  id: "med-1",
  brand_name: "Telma 40",
  display_generic: "telmisartan",
  salts: [{ inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" }],
  form: "tablet",
  pack_size: 30,
  mrp_inr: "234.00",
  expiry_month: "2026-09-01",
  batch_number: "B123",
  manufacturer: "Acme Pharma",
  high_risk: false,
  high_risk_reason: null,
  field_confidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
  usual_frequency_hint: null,
  status: "active",
  created_at: "2026-07-17T00:00:00.000Z",
};

const draft: DraftMedication = {
  tempId: "draft-1",
  brandName: " Telma 40 ",
  salts: [{ inn: "Telmisartan", fdaSearchName: "TELMISARTAN", strengthValue: 40, strengthUnit: "mg" }],
  form: "tablet",
  packSize: 30,
  mrpInr: 234,
  expiryDate: "2026-09",
  batchNumber: "B123",
  manufacturer: "Acme Pharma",
  fieldConfidence: { brandName: 1, salts: 1, mrpInr: 1, expiryDate: 1 },
  warnings: [],
  highRisk: false,
  highRiskReason: null,
  usualFrequencyHint: null,
  displayGeneric: "telmisartan",
};

describe("Supabase medication adapter", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant);
  });

  it("lists only active medications for the active household patient", async () => {
    const client = createMockSupabase([{ data: [medicationRow], error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const medications = await listSupabaseMedications();

    expect(medications[0]).toMatchObject({
      id: "med-1",
      brandName: "Telma 40",
      expiryDate: "2026-09",
      status: "active",
    });
    expect(client.queries[0]).toMatchObject({ table: "medications", operation: "select" });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "status", value: "active" },
      ]),
    );
  });

  it("claims a scan and inserts medications inside the active tenant scope", async () => {
    const client = createMockSupabase([
      { data: { id: "scan-1" }, error: null },
      { data: [medicationRow], error: null },
      { data: { id: "scan-1" }, error: null },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    await createSupabaseMedications([draft], "scan-1");

    expect(client.queries[0]).toMatchObject({
      table: "scan_batches",
      operation: "update",
      payload: { status: "confirming" },
    });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: "scan-1" },
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "status", value: "extracted" },
      ]),
    );
    expect(client.queries[1]).toMatchObject({ table: "medications", operation: "insert" });
    expect(client.queries[1].payload).toEqual([
      expect.objectContaining({
        household_id: "household-1",
        patient_id: "patient-1",
        scan_batch_id: "scan-1",
        brand_name: "Telma 40",
        display_generic: "telmisartan",
      }),
    ]);
    expect(client.queries[2].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "status", value: "confirming" },
      ]),
    );
  });

  it("patches a medication only after matching the active household patient", async () => {
    const client = createMockSupabase([{ data: medicationRow, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    await updateSupabaseMedication("med-1", { brandName: "Telma 40 daily", expiryDate: "2026-12" });

    expect(client.queries[0]).toMatchObject({
      table: "medications",
      operation: "update",
      payload: { brand_name: "Telma 40 daily", expiry_month: "2026-12-01" },
    });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: "med-1" },
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
      ]),
    );
  });

  it("archives a medication through the controlled tenant RPC", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    await archiveSupabaseMedication("med-1");

    expect(getSupabaseHousehold).toHaveBeenCalledWith(client);
    expect(client.queries).toEqual([]);
    expect(client.rpcCalls).toEqual([
      { functionName: "archive_medication", args: { medication_id_input: "med-1" } },
    ]);
  });
});
