import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  usesSupabaseAuth: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: mocked.usesSupabaseAuth,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signInWithPassword: mocked.signInWithPassword },
  })),
}));

import { POST } from "@/app/api/auth/login/route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth login route", () => {
  beforeEach(() => {
    mocked.usesSupabaseAuth.mockReset().mockReturnValue(true);
    mocked.signInWithPassword.mockReset();
  });

  it("returns 404 when Supabase auth is not enabled on this deployment", async () => {
    mocked.usesSupabaseAuth.mockReturnValue(false);

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(404);
    expect(mocked.signInWithPassword).not.toHaveBeenCalled();
  });

  it("rejects a missing password", async () => {
    const response = await POST(request({ email: "priya@example.com", password: "" }));

    expect(response.status).toBe(400);
    expect(mocked.signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns 200 and writes the session when the credentials are correct", async () => {
    mocked.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocked.signInWithPassword).toHaveBeenCalledWith({
      email: "priya@example.com",
      password: "password123",
    });
  });

  it("returns 401 when Supabase rejects the credentials", async () => {
    mocked.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });

    const response = await POST(request({ email: "priya@example.com", password: "wrong-password" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns 401 when Supabase errors are absent but no session is returned", async () => {
    mocked.signInWithPassword.mockResolvedValue({ data: { session: null, user: null }, error: null });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(401);
  });
});
