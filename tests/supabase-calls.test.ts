import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  ensureAudio: vi.fn(),
  placeCall: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/tts", () => ({ ensureAudio: mocked.ensureAudio }));
vi.mock("@/lib/integrations/twilio", () => ({ placeCall: mocked.placeCall }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { listSupabaseReminderCalls, placeSupabaseGroupReminder } from "@/lib/supabase/calls";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  order() {
    return this;
  }
  limit() {
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

const tenant = {
  id: "household-1",
  caregiverName: "Priya",
  uiLanguage: "en",
  patient: {
    id: "patient-1",
    name: "Kamla Devi",
    phoneE164: "+919876543210",
    language: "en",
    voiceGender: "female" as const,
    timezone: "Asia/Kolkata",
    smsReminderConsent: true,
  },
};

describe("Supabase reminder call adapter", () => {
  beforeEach(() => {
    mocked.ensureAudio.mockReset().mockResolvedValue({
      hash: "clip-hash",
      filePath: "audio/clip-hash.mp3",
      url: "/api/audio/clip-hash.mp3",
      scriptText: "hello",
    });
    mocked.placeCall.mockReset();
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant);
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  describe("listSupabaseReminderCalls", () => {
    it("maps call history and counts doses through the join table", async () => {
      const client = createMockSupabase([
        {
          data: [
            {
              id: "call-1",
              scheduled_at_utc: "2026-07-17T02:30:00.000Z",
              mode: "twilio",
              attempt: 1,
              twilio_status: "completed",
              outcome: "confirmed",
              digits_pressed: "1",
              audio_object_key: JSON.stringify({
                language: "en",
                medlist: "abc.mp3",
                menu: "def.mp3",
                thanks: "ghi.mp3",
                noinput: "jkl.mp3",
              }),
              created_at: "2026-07-17T02:30:05.000Z",
            },
          ],
          error: null,
        },
        { data: [{ call_id: "call-1" }, { call_id: "call-1" }], error: null },
      ]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      const calls = await listSupabaseReminderCalls();

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        id: "call-1",
        time: "08:00",
        mode: "twilio",
        outcome: "confirmed",
        digitsPressed: "1",
        doseCount: 2,
        medlistUrl: "/api/audio/abc.mp3",
      });
      expect(client.queries[0].filters).toEqual(
        expect.arrayContaining([
          { method: "eq", column: "household_id", value: "household-1" },
          { method: "eq", column: "patient_id", value: "patient-1" },
        ]),
      );
      expect(client.queries[1].table).toBe("reminder_call_dose_events");
      expect(client.queries[1].filters).toEqual([{ method: "in", column: "call_id", value: ["call-1"] }]);
    });

    it("skips the join lookup entirely when there is no call history", async () => {
      const client = createMockSupabase([{ data: [], error: null }]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      const calls = await listSupabaseReminderCalls();

      expect(calls).toEqual([]);
      expect(client.queries).toHaveLength(1);
    });
  });

  describe("placeSupabaseGroupReminder", () => {
    const doseEventRows = [
      {
        id: "dose-1",
        medications: { brand_name: "Telma 40" },
        schedules: { dose_instruction: "1 tablet", food_relation: "after_food" },
      },
    ];

    it("claims pending dose events and creates a simulated call", async () => {
      const admin = createMockSupabase([
        { data: [{ id: "dose-1", attempts: 0 }], error: null }, // candidate check
        { data: doseEventRows, error: null }, // getSupabaseSlotMedsForEvents
        { data: [{ id: "dose-1" }], error: null }, // compare-and-set claim
        { data: null, error: null }, // insert reminder_calls
        { data: null, error: null }, // insert reminder_call_dose_events
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(createMockSupabase([]) as never);

      const result = await placeSupabaseGroupReminder({
        doseEventIds: ["dose-1"],
        scheduledAtUtc: new Date("2026-07-17T02:30:00.000Z"),
        mode: "simulated",
      });

      expect(result.placed).toBe(true);
      expect(result.reminderCallId).toEqual(expect.any(String));
      expect(result.audioUrls.medlistUrl).toBe("/api/audio/clip-hash.mp3");

      expect(admin.queries[2].operation).toBe("update");
      expect(admin.queries[2].payload).toMatchObject({ status: "calling" });
      expect(admin.queries[3].table).toBe("reminder_calls");
      expect(admin.queries[3].operation).toBe("insert");
      expect(admin.queries[3].payload).toMatchObject({
        household_id: "household-1",
        patient_id: "patient-1",
        mode: "simulated",
      });
      expect(admin.queries[4].table).toBe("reminder_call_dose_events");
      expect(mocked.placeCall).not.toHaveBeenCalled();
    });

    it("places a real Twilio call and records the call sid", async () => {
      mocked.placeCall.mockResolvedValue("CA123");
      const admin = createMockSupabase([
        { data: [{ id: "dose-1", attempts: 0 }], error: null },
        { data: doseEventRows, error: null },
        { data: [{ id: "dose-1" }], error: null },
        { data: null, error: null },
        { data: null, error: null },
        { data: null, error: null }, // twilio_call_sid update
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(createMockSupabase([]) as never);

      const result = await placeSupabaseGroupReminder({
        doseEventIds: ["dose-1"],
        scheduledAtUtc: new Date("2026-07-17T02:30:00.000Z"),
        mode: "twilio",
      });

      expect(result.placed).toBe(true);
      expect(mocked.placeCall).toHaveBeenCalledWith("+919876543210", result.reminderCallId);
      expect(admin.queries[5].payload).toMatchObject({ twilio_call_sid: "CA123" });
    });

    it("refuses when no dose events are still pending", async () => {
      const admin = createMockSupabase([{ data: [], error: null }]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(createMockSupabase([]) as never);

      await expect(
        placeSupabaseGroupReminder({
          doseEventIds: ["dose-1"],
          scheduledAtUtc: new Date(),
          mode: "simulated",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("reports a conflict when the compare-and-set claim loses the race", async () => {
      const admin = createMockSupabase([
        { data: [{ id: "dose-1", attempts: 0 }], error: null },
        { data: doseEventRows, error: null },
        { data: [], error: null }, // claim update — another worker already claimed it
      ]);
      vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(createMockSupabase([]) as never);

      await expect(
        placeSupabaseGroupReminder({
          doseEventIds: ["dose-1"],
          scheduledAtUtc: new Date(),
          mode: "simulated",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });
});
