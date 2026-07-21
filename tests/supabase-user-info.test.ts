import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
  headers: vi.fn(async () => ({ get: () => null })),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: mocked.createServerClient,
}));
vi.mock("@/lib/supabase/runtime", () => ({
  assertSupabaseAuthConfig: () => ({ url: "https://example.supabase.co", anonKey: "anon-key" }),
}));

import { getSupabaseUserInfo } from "@/lib/supabase/server";

describe("getSupabaseUserInfo", () => {
  beforeEach(() => {
    mocked.getUser.mockReset();
    mocked.createServerClient.mockReset().mockReturnValue({
      auth: { getUser: mocked.getUser },
    });
  });

  it("returns isAnonymous: true for a demo/guest session", async () => {
    mocked.getUser.mockResolvedValue({
      data: { user: { id: "user-1", is_anonymous: true } },
      error: null,
    });

    const info = await getSupabaseUserInfo();

    expect(info).toEqual({ id: "user-1", isAnonymous: true });
  });

  it("returns isAnonymous: false for a regular password/OAuth session", async () => {
    mocked.getUser.mockResolvedValue({
      data: { user: { id: "user-2", is_anonymous: false } },
      error: null,
    });

    const info = await getSupabaseUserInfo();

    expect(info).toEqual({ id: "user-2", isAnonymous: false });
  });

  it("returns null when there is no authenticated user", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const info = await getSupabaseUserInfo();

    expect(info).toBeNull();
  });

  it("returns null when Supabase reports an error verifying the token", async () => {
    mocked.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid token" } });

    const info = await getSupabaseUserInfo();

    expect(info).toBeNull();
  });
});
