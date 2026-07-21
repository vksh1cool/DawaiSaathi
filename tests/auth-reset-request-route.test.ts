import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  usesSupabaseAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: mocked.usesSupabaseAuth,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { resetPasswordForEmail: mocked.resetPasswordForEmail },
  })),
}));

import { POST } from "@/app/api/auth/reset/request/route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/reset/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth reset request route", () => {
  beforeEach(() => {
    mocked.usesSupabaseAuth.mockReset().mockReturnValue(true);
    mocked.resetPasswordForEmail.mockReset();
  });

  it("returns 404 when Supabase auth is not enabled on this deployment", async () => {
    mocked.usesSupabaseAuth.mockReturnValue(false);

    const response = await POST(request({ email: "priya@example.com" }));

    expect(response.status).toBe(404);
    expect(mocked.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid email address", async () => {
    const response = await POST(request({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    expect(mocked.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("always responds ok:true to avoid leaking whether the email is registered", async () => {
    mocked.resetPasswordForEmail.mockResolvedValue({ error: null });

    const response = await POST(request({ email: "priya@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocked.resetPasswordForEmail).toHaveBeenCalledWith(
      "priya@example.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/auth/callback") }),
    );
  });

  it("defaults the post-reset redirect to /auth/reset", async () => {
    mocked.resetPasswordForEmail.mockResolvedValue({ error: null });

    await POST(request({ email: "priya@example.com" }));

    const [, options] = mocked.resetPasswordForEmail.mock.calls[0];
    expect(decodeURIComponent(options.redirectTo)).toContain("next=/auth/reset");
  });

  it("surfaces a validation error when Supabase fails to send the reset email", async () => {
    mocked.resetPasswordForEmail.mockResolvedValue({ error: { message: "boom" } });

    const response = await POST(request({ email: "priya@example.com" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "VALIDATION" } });
  });
});
