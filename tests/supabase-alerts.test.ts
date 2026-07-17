import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));

import { listSupabaseAlerts, markSupabaseAlertRead } from "@/lib/supabase/alerts";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

type QueryResponse = { data?: unknown; error?: { code?: string } | null };

class SupabaseQuery {
  readonly filters: { method: "eq"; column: string; value: unknown }[] = [];
  operation: "select" | "update" | null = null;
  payload: unknown;

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {}

  select() {
    this.operation = "select";
    return this;
  }

  update(payload: unknown) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
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
  return {
    queries,
    from: vi.fn((table: string) => {
      const query = new SupabaseQuery(table, responses[queries.length] ?? { data: null, error: null });
      queries.push(query);
      return query;
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

describe("Supabase alerts adapter", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant);
  });

  it("lists alerts for only the active household patient", async () => {
    const client = createMockSupabase([
      {
        data: [
          {
            id: "alert-1",
            type: "unconfirmed_dose",
            message_en: "Missed dose",
            message_hi: "दवा छूट गई",
            read_at: null,
            created_at: "2026-07-17T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const alerts = await listSupabaseAlerts();

    expect(alerts).toEqual([
      {
        id: "alert-1",
        type: "unconfirmed_dose",
        messageEn: "Missed dose",
        messageHi: "दवा छूट गई",
        read: false,
        createdAt: "2026-07-17T00:00:00.000Z",
      },
    ]);
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
      ]),
    );
  });

  it("marks an alert read inside the active household patient scope", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    await markSupabaseAlertRead("alert-1");

    expect(getSupabaseHousehold).toHaveBeenCalledWith(client);
    expect(client.queries[0]).toMatchObject({
      table: "caregiver_alerts",
      operation: "update",
      payload: { read_at: expect.any(String) },
    });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "id", value: "alert-1" },
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
      ]),
    );
  });
});
