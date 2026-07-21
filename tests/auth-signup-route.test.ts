import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  usesSupabaseAuth: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: mocked.usesSupabaseAuth,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { signUp: mocked.signUp },
  })),
}));

import { POST } from "@/app/api/auth/signup/route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth signup route", () => {
  beforeEach(() => {
    mocked.usesSupabaseAuth.mockReset().mockReturnValue(true);
    mocked.signUp.mockReset();
  });

  it("returns 404 when Supabase auth is not enabled on this deployment", async () => {
    mocked.usesSupabaseAuth.mockReturnValue(false);

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(404);
    expect(mocked.signUp).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters", async () => {
    const response = await POST(request({ email: "priya@example.com", password: "short" }));

    expect(response.status).toBe(400);
    expect(mocked.signUp).not.toHaveBeenCalled();
  });

  it("rejects an invalid email address", async () => {
    const response = await POST(request({ email: "not-an-email", password: "password123" }));

    expect(response.status).toBe(400);
    expect(mocked.signUp).not.toHaveBeenCalled();
  });

  it("creates the account and reports confirmationRequired when no session is returned", async () => {
    mocked.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: "identity-1" }] }, session: null },
      error: null,
    });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, confirmationRequired: true });
    expect(mocked.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "priya@example.com", password: "password123" }),
    );
  });

  it("reports confirmationRequired: false when Supabase returns a live session", async () => {
    mocked.signUp.mockResolvedValue({
      data: { user: { identities: [{ id: "identity-1" }] }, session: { access_token: "token" } },
      error: null,
    });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, confirmationRequired: false });
  });

  it("treats an empty identities array as an existing confirmed account", async () => {
    mocked.signUp.mockResolvedValue({
      data: { user: { identities: [] }, session: null },
      error: null,
    });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CONFLICT" } });
  });

  it("surfaces a generic validation error when Supabase signUp fails", async () => {
    mocked.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { message: "boom" } });

    const response = await POST(request({ email: "priya@example.com", password: "password123" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION" } });
  });
});
