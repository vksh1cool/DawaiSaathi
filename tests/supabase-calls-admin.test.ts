import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import {
  getSupabaseReminderCallAdmin,
  handleSupabaseGatherResult,
  finalizeSupabaseUnconfirmed,
} from "@/lib/supabase/calls-admin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { config } from "@/lib/config";

type QueryResponse = { data?: unknown; error?: { code?: string } | null };

class SupabaseQuery {
  readonly filters: { method: string; column: string; value: unknown }[] = [];
  operation: "select" | "insert" | "update" | "delete" | null = null;
  payload: unknown = null;

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {}

  select(columns?: string) {
    if (!this.operation) this.operation = "select";
    void columns;
    return this;
  }
  insert(rows: unknown) {
    this.operation = "insert";
    this.payload = rows;
    return this;
  }
  update(patch: unknown) {
    this.operation = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }
  in(column: string, value: unknown) {
    this.filters.push({ method: "in", column, value });
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push({ method: "is", column, value });
    return this;
  }
  lt(column: string, value: unknown) {
    this.filters.push({ method: "lt", column, value });
    return this;
  }
  maybeSingle() {
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

const baseCallRow = {
  id: "call-1",
  household_id: "household-1",
  patient_id: "patient-1",
  scheduled_at_utc: "2026-07-17T02:30:00.000Z",
  attempt: 1,
  mode: "twilio",
  twilio_call_sid: null,
  twilio_status: null,
  digits_pressed: null,
  outcome: null,
  replay_count: 0,
  audio_object_key: JSON.stringify({ language: "en", medlist: "abc.mp3" }),
};

describe("Supabase call-admin adapter", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  describe("getSupabaseReminderCallAdmin", () => {
    it("maps the call row and its joined dose event ids", async () => {
      const admin = createMockSupabase([
        { data: baseCallRow, error: null },
        { data: [{ dose_event_id: "dose-1" }, { dose_event_id: "dose-2" }], error: null },
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      const call = await getSupabaseReminderCallAdmin("call-1");

      expect(call).toMatchObject({
        id: "call-1",
        householdId: "household-1",
        patientId: "patient-1",
        mode: "twilio",
        outcome: null,
        doseEventIds: ["dose-1", "dose-2"],
      });
    });

    it("returns null when the call does not exist", async () => {
      const admin = createMockSupabase([{ data: null, error: null }]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      const call = await getSupabaseReminderCallAdmin("missing");
      expect(call).toBeNull();
    });
  });

  describe("handleSupabaseGatherResult", () => {
    it("confirms the dose when digit 1 is pressed and the claim succeeds", async () => {
      const admin = createMockSupabase([
        { data: baseCallRow, error: null }, // getSupabaseReminderCallAdmin: reminder_calls
        { data: [{ dose_event_id: "dose-1" }], error: null }, // ...: join
        { data: [{ id: "dose-1", status: "calling" }], error: null }, // dose_events eligibility check
        { data: [{ id: "call-1" }], error: null }, // compare-and-set claim
        { data: null, error: null }, // dose_events update -> confirmed
        { data: { ...baseCallRow, outcome: "confirmed", digits_pressed: "1" }, error: null }, // re-fetch: reminder_calls
        { data: [{ dose_event_id: "dose-1" }], error: null }, // re-fetch: join
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      const result = await handleSupabaseGatherResult("call-1", "1");

      expect(result?.action).toBe("confirmed");
      expect(result?.call.outcome).toBe("confirmed");
      expect(admin.queries[4].table).toBe("dose_events");
      expect(admin.queries[4].payload).toMatchObject({ status: "confirmed", confirmed_via: "ivr_dtmf" });
    });

    it("reports the settled outcome without double-mutating on a duplicate keypress", async () => {
      const admin = createMockSupabase([
        { data: { ...baseCallRow, outcome: "confirmed" }, error: null },
        { data: [{ dose_event_id: "dose-1" }], error: null },
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      const result = await handleSupabaseGatherResult("call-1", "1");

      expect(result?.action).toBe("confirmed");
      expect(admin.queries).toHaveLength(2); // only the initial lookup — no further mutation
    });
  });

  describe("finalizeSupabaseUnconfirmed", () => {
    it("marks exhausted dose events missed and raises an unconfirmed_dose caregiver alert (no SMS)", async () => {
      const exhaustedAttempts = config.maxCallAttempts - 1;
      const admin = createMockSupabase([
        { data: baseCallRow, error: null }, // getSupabaseReminderCallAdmin: reminder_calls
        { data: [{ dose_event_id: "dose-1" }], error: null }, // ...: join
        { data: [{ id: "call-1" }], error: null }, // claim finalization
        {
          data: [{ id: "dose-1", status: "calling", attempts: exhaustedAttempts }],
          error: null,
        }, // dose_events select
        { data: null, error: null }, // dose_events update -> missed
        {
          data: {
            id: "patient-1",
            household_id: "household-1",
            name: "Kamla Devi",
            timezone: "Asia/Kolkata",
            phone_e164: "+919876543210",
            language: "en",
            sms_reminder_consent_at: null,
          },
          error: null,
        }, // patients select
        { data: null, error: null }, // caregiver_alerts insert
        { data: null, error: null }, // caregiver_alert_dose_events insert
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      await finalizeSupabaseUnconfirmed("call-1", "not_answered");

      const doseUpdate = admin.queries[4];
      expect(doseUpdate.table).toBe("dose_events");
      expect(doseUpdate.payload).toMatchObject({ status: "missed", attempts: config.maxCallAttempts });

      const alertInsert = admin.queries[6];
      expect(alertInsert.table).toBe("caregiver_alerts");
      expect(alertInsert.payload).toMatchObject({
        household_id: "household-1",
        patient_id: "patient-1",
        type: "unconfirmed_dose",
      });

      const joinInsert = admin.queries[7];
      expect(joinInsert.table).toBe("caregiver_alert_dose_events");
      expect(joinInsert.payload).toEqual([
        { alert_id: expect.any(String), dose_event_id: "dose-1", household_id: "household-1", patient_id: "patient-1" },
      ]);

      // Supabase tenants intentionally skip the SMS-fallback table entirely.
      expect(admin.queries.some((q) => q.table === "sms_deliveries")).toBe(false);
    });

    it("is a no-op when the call already settled", async () => {
      const admin = createMockSupabase([
        { data: { ...baseCallRow, outcome: "confirmed" }, error: null }, // reminder_calls
        { data: [{ dose_event_id: "dose-1" }], error: null }, // join
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

      await finalizeSupabaseUnconfirmed("call-1", "no_input");

      expect(admin.queries).toHaveLength(2); // only the initial lookup + its join fetch — no claim, no mutation
    });
  });
});
