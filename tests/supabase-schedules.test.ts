import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  callLLM: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/openai", () => ({ callLLM: mocked.callLLM }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));

import {
  getActiveSupabaseSchedules,
  saveSupabaseSchedules,
  suggestSupabaseSchedules,
} from "@/lib/supabase/schedules";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import type { ScheduleInput } from "@/lib/schedule";

type QueryResponse = {
  data?: unknown;
  error?: { code?: string } | null;
};

class SupabaseQuery {
  readonly filters: { method: "eq"; column: string; value: unknown }[] = [];
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

const scheduleInput: ScheduleInput = {
  medicationId: "med-1",
  times: ["08:00", "20:00"],
  doseInstruction: "one tablet",
  foodRelation: "after_food",
  startDate: "2026-07-17",
  endDate: null,
};

describe("Supabase schedule adapter", () => {
  beforeEach(() => {
    mocked.callLLM.mockReset();
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant);
  });

  it("lists active schedules for only the active household patient", async () => {
    const client = createMockSupabase([
      {
        data: [
          {
            id: "schedule-1",
            medication_id: "med-1",
            times: ["08:00"],
            dose_instruction: "one tablet",
            food_relation: "after_food",
            start_date: "2026-07-17",
            end_date: null,
            medications: { id: "med-1", brand_name: "Telma 40", display_generic: "telmisartan", status: "active" },
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const schedules = await getActiveSupabaseSchedules();

    expect(schedules[0]).toMatchObject({
      id: "schedule-1",
      medicationId: "med-1",
      medication: { brandName: "Telma 40" },
      times: ["08:00"],
      startDate: "2026-07-17",
    });
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "active", value: true },
        { method: "eq", column: "medications.status", value: "active" },
      ]),
    );
  });

  it("saves schedules through the controlled tenant RPC", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    await saveSupabaseSchedules([scheduleInput], "Kamla Devi");

    expect(getSupabaseHousehold).toHaveBeenCalledWith(client);
    expect(client.rpcCalls).toEqual([
      {
        functionName: "save_medication_schedules",
        args: {
          schedules_input: [scheduleInput],
          weekly_override_patient_name: "Kamla Devi",
        },
      },
    ]);
  });

  it("suggests schedules from tenant medications with deterministic fallback", async () => {
    mocked.callLLM.mockRejectedValue(new Error("budget unavailable"));
    const client = createMockSupabase([
      {
        data: [
          {
            id: "med-1",
            display_generic: "telmisartan",
            salts: [{ inn: "telmisartan", fdaSearchName: "telmisartan", strengthValue: 40, strengthUnit: "mg" }],
            usual_frequency_hint: { timesPerDay: 2, timing: [] },
            created_at: "2026-07-17T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const suggestions = await suggestSupabaseSchedules();

    expect(suggestions).toEqual([
      { medicationId: "med-1", times: ["08:00", "20:00"], foodRelation: "any", lowConfidence: false },
    ]);
    expect(client.queries[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "status", value: "active" },
      ]),
    );
  });
});
