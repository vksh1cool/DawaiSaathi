import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  config: { supabasePhoneAuthEnabled: false },
  usesSupabaseAuth: vi.fn(),
  createSupabaseServerClient: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config", () => ({ config: mocked.config }));
vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: mocked.usesSupabaseAuth,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocked.createSupabaseServerClient,
}));

import { POST } from "@/app/api/auth/otp/request/route";

describe("POST /api/auth/otp/request", () => {
  beforeEach(() => {
    mocked.config.supabasePhoneAuthEnabled = false;
    mocked.usesSupabaseAuth.mockReset().mockReturnValue(true);
    mocked.createSupabaseServerClient.mockReset().mockResolvedValue({
      auth: { signInWithOtp: mocked.signInWithOtp },
    });
    mocked.signInWithOtp.mockReset().mockResolvedValue({ error: null });
  });

  it("blocks phone OTP before calling Supabase when phone auth is disabled", async () => {
    const response = await POST(request({ phone: "+918085149514", next: "/" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION",
        message: "Phone sign-in is not enabled yet. Use email sign-in for this deployment.",
      },
    });
    expect(mocked.createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mocked.signInWithOtp).not.toHaveBeenCalled();
  });

  it("still sends email magic links when phone auth is disabled", async () => {
    const response = await POST(request({ email: "caregiver@example.com", next: "/today" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, delivery: "email" });
    expect(mocked.signInWithOtp).toHaveBeenCalledWith({
      email: "caregiver@example.com",
      options: {
        shouldCreateUser: true,
        emailRedirectTo: "http://localhost/auth/callback?next=%2Ftoday",
      },
    });
  });

  it("sends phone OTP only when explicitly enabled", async () => {
    mocked.config.supabasePhoneAuthEnabled = true;

    const response = await POST(request({ phone: "+918085149514", next: "/" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, delivery: "sms" });
    expect(mocked.signInWithOtp).toHaveBeenCalledWith({
      phone: "+918085149514",
      options: { shouldCreateUser: true },
    });
  });
});

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/auth/otp/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
