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
  confirmSupabaseDoseGroup,
  getSupabaseAdherence,
  getSupabaseToday,
  markSupabaseDose,
} from "@/lib/supabase/dose-events";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

type QueryResponse = {
  data?: unknown;
  error?: { code?: string } | null;
};

class SupabaseQuery {
  readonly filters: { method: "eq" | "gte" | "lte"; column: string; value: unknown }[] = [];
  operation: "select" | null = null;
  selectedColumns: string | null = null;
  orderBy: { column: string; ascending?: boolean } | null = null;

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {}

  select(columns: string) {
    this.operation = "select";
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

  lte(column: string, value: unknown) {
    this.filters.push({ method: "lte", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending };
    return this;
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

describe("Supabase dose event adapter", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant);
  });

  it("loads today's dose groups within the active household patient scope", async () => {
    const client = createMockSupabase([
      {
        data: [
          {
            id: "dose-1",
            medication_id: "med-1",
            scheduled_at_utc: "2026-07-17T02:30:00.000Z",
            status: "scheduled",
            medications: {
              id: "med-1",
              brand_name: "Telma 40",
              form: "tablet",
              high_risk: false,
              expiry_month: "2026-09-01",
            },
            schedules: { food_relation: "after_food" },
          },
          {
            id: "dose-2",
            medication_id: "med-2",
            scheduled_at_utc: "2026-07-17T02:30:00.000Z",
            status: "scheduled",
            medications: {
              id: "med-2",
              brand_name: "Amlong 5",
              form: "tablet",
              high_risk: false,
              expiry_month: null,
            },
            schedules: { food_relation: "after_food" },
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const today = await getSupabaseToday();

    expect(today.groups).toHaveLength(1);
    expect(today.groups[0]).toMatchObject({
      time: "08:00",
      status: "upcoming",
      foodRelation: "after_food",
      doseEventIds: ["dose-1", "dose-2"],
      meds: [
        { medicationId: "med-1", brandName: "Telma 40", count: 1, expiryStatus: "ok" },
        { medicationId: "med-2", brandName: "Amlong 5", count: 1, expiryStatus: "unknown" },
      ],
    });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "gte", column: "scheduled_at_utc", value: expect.any(String) },
        { method: "lte", column: "scheduled_at_utc", value: expect.any(String) },
      ]),
    );
  });

  it("marks a single dose through the controlled tenant RPC", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const result = await markSupabaseDose("dose-1", "skipped");

    expect(result).toEqual({ id: "dose-1", status: "skipped" });
    expect(getSupabaseHousehold).toHaveBeenCalledWith(client);
    expect(client.rpcCalls).toEqual([
      {
        functionName: "mark_dose_event",
        args: { dose_event_id_input: "dose-1", status_input: "skipped" },
      },
    ]);
  });

  it("confirms a dose group through the controlled tenant RPC", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const result = await confirmSupabaseDoseGroup(["dose-1", "dose-2"]);

    expect(result).toEqual([
      { id: "dose-1", status: "confirmed" },
      { id: "dose-2", status: "confirmed" },
    ]);
    expect(client.rpcCalls).toEqual([
      {
        functionName: "confirm_dose_event_group",
        args: { dose_event_ids_input: ["dose-1", "dose-2"] },
      },
    ]);
  });

  it("loads adherence inside the active household patient scope", async () => {
    const client = createMockSupabase([{ data: [], error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const adherence = await getSupabaseAdherence(7);

    expect(adherence).toMatchObject({ confirmationRate: null, confirmed: 0, notConfirmed: 0 });
    expect(adherence.byDay).toHaveLength(7);
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "gte", column: "scheduled_at_utc", value: expect.any(String) },
        { method: "lte", column: "scheduled_at_utc", value: expect.any(String) },
      ]),
    );
  });
});
