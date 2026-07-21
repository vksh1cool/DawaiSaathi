import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  computeInteractions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/interactions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/interactions")>();
  return { ...actual, computeInteractions: mocked.computeInteractions };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/household", () => ({
  getSupabaseHousehold: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { runSupabaseInteractions } from "@/lib/supabase/interactions";
import { getSupabaseHousehold } from "@/lib/supabase/household";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ method: "eq", column, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ method: "neq", column, value });
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
  patient: { id: "patient-1" },
};

describe("runSupabaseInteractions", () => {
  beforeEach(() => {
    mocked.computeInteractions.mockReset();
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseHousehold).mockReset().mockResolvedValue(tenant as never);
    vi.mocked(createSupabaseAdminClient).mockReset();
  });

  it("loads active medicines, parses salts, and persists findings insert-then-delete", async () => {
    const medRows = [
      { id: "med-a", brand_name: "Ecosprin 75", salts: [{ inn: "Aspirin", fdaSearchName: "aspirin" }] },
      { id: "med-b", brand_name: "Warf 5", salts: [{ inn: "Warfarin" }] },
    ];
    const server = createMockSupabase([{ data: medRows, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(server as never);

    const finding = {
      id: "finding-1",
      pairKey: "med-a|med-b",
      medAId: "med-a",
      medBId: "med-b",
      saltA: "aspirin",
      saltB: "warfarin",
      severity: "high",
      source: "curated",
      explanationEn: "Increases bleeding risk.",
      explanationHi: "रक्तस्राव का खतरा बढ़ जाता है।",
      actionEn: "Discuss with your doctor.",
      actionHi: "डॉक्टर से बात करें।",
      evidence: null,
    };
    mocked.computeInteractions.mockResolvedValue({
      findings: [finding],
      checkedMedsCount: 2,
      ranAt: "2026-07-17T00:00:00.000Z",
    });

    const admin = createMockSupabase([
      { data: null, error: null }, // insert
      { data: null, error: null }, // delete
    ]);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

    const result = await runSupabaseInteractions();

    expect(mocked.computeInteractions).toHaveBeenCalledWith(
      [
        { id: "med-a", brandName: "Ecosprin 75" },
        { id: "med-b", brandName: "Warf 5" },
      ],
      [
        { medId: "med-a", brand: "Ecosprin 75", inn: "aspirin", fdaSearchName: "aspirin" },
        { medId: "med-b", brand: "Warf 5", inn: "warfarin", fdaSearchName: "Warfarin" },
      ],
      expect.any(Function),
    );
    expect(result.findings).toEqual([finding]);

    expect(admin.queries).toHaveLength(2);
    expect(admin.queries[0].table).toBe("interaction_findings");
    expect(admin.queries[0].operation).toBe("insert");
    expect(admin.queries[0].payload).toEqual([
      expect.objectContaining({
        id: "finding-1",
        household_id: "household-1",
        patient_id: "patient-1",
        pair_key: "med-a|med-b",
        acknowledged: false,
      }),
    ]);
    expect(admin.queries[1].operation).toBe("delete");
    expect(admin.queries[1].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", column: "household_id", value: "household-1" },
        { method: "eq", column: "patient_id", value: "patient-1" },
        { method: "eq", column: "acknowledged", value: false },
      ]),
    );
  });

  it("skips the insert step entirely and only cleans up when no findings are found", async () => {
    const server = createMockSupabase([{ data: [], error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(server as never);
    mocked.computeInteractions.mockResolvedValue({ findings: [], checkedMedsCount: 0, ranAt: "2026-07-17T00:00:00.000Z" });

    const admin = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(admin as never);

    const result = await runSupabaseInteractions();

    expect(result.findings).toEqual([]);
    expect(admin.queries).toHaveLength(1);
    expect(admin.queries[0].operation).toBe("delete");
  });
});
