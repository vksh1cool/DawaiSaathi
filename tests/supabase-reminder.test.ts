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
  getSupabaseSlotMeds,
  getSupabaseSlotMedsForEvents,
  buildSupabaseSlotScripts,
} from "@/lib/supabase/reminder";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

type QueryResponse = { data?: unknown; error?: { code?: string } | null };

class SupabaseQuery {
  readonly filters: { method: string; column: string; value: unknown }[] = [];

  constructor(
    readonly table: string,
    private readonly response: QueryResponse,
  ) {}

  select() {
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
    language: "en" as const,
    voiceGender: "female",
    timezone: "Asia/Kolkata",
    smsReminderConsent: true,
  },
};

describe("Supabase reminder script builders", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant as never);
  });

  describe("getSupabaseSlotMeds", () => {
    it("keeps only schedules whose active times include the requested slot", async () => {
      const client = createMockSupabase([
        {
          data: [
            {
              times: ["08:00", "20:00"],
              dose_instruction: "1 tablet",
              food_relation: "after_food",
              medications: { brand_name: "Telma 40", status: "active" },
            },
            {
              times: ["13:00"],
              dose_instruction: "1 tablet",
              food_relation: "any",
              medications: { brand_name: "Metformin 500", status: "active" },
            },
          ],
          error: null,
        },
      ]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      const slot = await getSupabaseSlotMeds("08:00");

      expect(slot.meds).toEqual([{ brandName: "Telma 40", doseInstruction: "1 tablet" }]);
      expect(slot.foodRelation).toBe("after_food");
    });
  });

  describe("getSupabaseSlotMedsForEvents", () => {
    it("resolves brand names and food relation for the given dose events", async () => {
      const client = createMockSupabase([
        {
          data: [
            {
              id: "dose-1",
              medications: { brand_name: "Telma 40" },
              schedules: { dose_instruction: "1 tablet", food_relation: "after_food" },
            },
          ],
          error: null,
        },
      ]);

      const slot = await getSupabaseSlotMedsForEvents(client as never, "household-1", "patient-1", ["dose-1"]);

      expect(slot.meds).toEqual([{ brandName: "Telma 40", doseInstruction: "1 tablet" }]);
      expect(slot.foodRelation).toBe("after_food");
    });

    it("refuses to place a call when a dose instruction is missing (pre-migration record)", async () => {
      const client = createMockSupabase([
        {
          data: [
            {
              id: "dose-1",
              medications: { brand_name: "Telma 40" },
              schedules: { dose_instruction: "", food_relation: "after_food" },
            },
          ],
          error: null,
        },
      ]);

      await expect(
        getSupabaseSlotMedsForEvents(client as never, "household-1", "patient-1", ["dose-1"]),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });

  describe("buildSupabaseSlotScripts", () => {
    it("builds preview scripts from the persisted schedule when no overrides are given", async () => {
      const client = createMockSupabase([
        {
          data: [
            {
              times: ["08:00"],
              dose_instruction: "1 tablet",
              food_relation: "after_food",
              medications: { brand_name: "Telma 40", status: "active" },
            },
          ],
          error: null,
        },
      ]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      const { scripts, language, voiceGender } = await buildSupabaseSlotScripts("08:00");

      expect(language).toBe("en");
      expect(voiceGender).toBe("female");
      expect(scripts.greetingMedlist).toContain("Telma 40: 1 tablet");
    });

    it("builds preview scripts from an unsaved draft when overrides are given", async () => {
      const client = createMockSupabase([
        { data: [{ id: "med-1", brand_name: "Ecosprin 75" }], error: null },
      ]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      const { scripts } = await buildSupabaseSlotScripts("08:00", [
        { medicationId: "med-1", doseInstruction: "half tablet", foodRelation: "before_food" },
      ]);

      expect(scripts.greetingMedlist).toContain("Ecosprin 75: half tablet");
      expect(client.queries[0].table).toBe("medications");
    });

    it("rejects a preview when the override references a medicine that is not active", async () => {
      const client = createMockSupabase([{ data: [], error: null }]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      await expect(
        buildSupabaseSlotScripts("08:00", [
          { medicationId: "med-missing", doseInstruction: "1 tablet", foodRelation: "any" },
        ]),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("rejects a preview when nothing is scheduled at that time", async () => {
      const client = createMockSupabase([{ data: [], error: null }]);
      vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

      await expect(buildSupabaseSlotScripts("23:45")).rejects.toMatchObject({ code: "VALIDATION" });
    });
  });
});
