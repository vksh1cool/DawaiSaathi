import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/cloudflare-runtime", () => ({
  usesSupabaseAuth: () => true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
  getSupabaseUserId: vi.fn(),
}));

import { POST as createInvitationRoute } from "@/app/api/household/invitations/route";
import { DELETE as revokeInvitationRoute } from "@/app/api/household/invitations/[id]/route";
import { GET as getMembersRoute } from "@/app/api/household/members/route";
import { DELETE as removeMemberRoute } from "@/app/api/household/members/[userId]/route";
import { createSupabaseServerClient, getSupabaseUserId } from "@/lib/supabase/server";

type RpcResponse = { data?: unknown; error?: { code?: string; message?: string } | null };

/**
 * A minimal `rpc()`-only thenable mock, in the same spirit as
 * supabase-alerts.test.ts's chainable `SupabaseQuery`/`createMockSupabase`:
 * queued responses are consumed in call order and every invocation is
 * recorded so assertions can check the exact RPC name and args used.
 */
function createMockSupabase(responses: RpcResponse[]) {
  const calls: { fn: string; args: unknown }[] = [];
  let cursor = 0;
  return {
    calls,
    rpc: vi.fn((fn: string, args?: unknown) => {
      calls.push({ fn, args });
      const response = responses[cursor] ?? { data: null, error: null };
      cursor += 1;
      return Promise.resolve(response);
    }),
  };
}

function jsonRequest(url: string, method: "POST" | "DELETE", body?: unknown) {
  return new Request(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("household invitations & members routes", () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockReset();
    vi.mocked(getSupabaseUserId).mockReset().mockResolvedValue("user-1");
  });

  it("creates an invitation (happy path)", async () => {
    const client = createMockSupabase([
      {
        data: [
          { invitation_id: "inv-1", invite_token: "raw-token-abc", expires_at: "2026-07-28T00:00:00.000Z" },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await createInvitationRoute(
      jsonRequest("http://localhost/api/household/invitations", "POST", {
        contact: "caregiver@example.com",
        role: "caregiver",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invitationId: "inv-1",
      inviteToken: "raw-token-abc",
      expiresAt: "2026-07-28T00:00:00.000Z",
    });
    expect(client.calls[0]).toEqual({
      fn: "create_household_invitation",
      args: { invitee_contact_input: "caregiver@example.com", role_input: "caregiver" },
    });
  });

  it("rejects invitation creation for an anonymous/guest caller", async () => {
    const client = createMockSupabase([
      { data: null, error: { code: "42501", message: "A guest session cannot invite a caregiver" } },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await createInvitationRoute(
      jsonRequest("http://localhost/api/household/invitations", "POST", {
        contact: "caregiver@example.com",
        role: "caregiver",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("revokes a pending invitation", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await revokeInvitationRoute(jsonRequest("http://localhost/api/household/invitations/inv-1", "DELETE"), {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(client.calls[0]).toEqual({
      fn: "revoke_household_invitation",
      args: { invitation_id_input: "inv-1" },
    });
  });

  it("maps a 42501 revoke error into a clean AppError", async () => {
    const client = createMockSupabase([
      { data: null, error: { code: "42501", message: "Only the household owner can revoke an invitation" } },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await revokeInvitationRoute(jsonRequest("http://localhost/api/household/invitations/inv-1", "DELETE"), {
      params: Promise.resolve({ id: "inv-1" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("lists the roster and pending invitations for the household owner", async () => {
    const client = createMockSupabase([
      {
        data: [
          {
            user_id: "user-1",
            role: "owner",
            display_name: "Priya",
            email: "priya@example.com",
            joined_at: "2026-07-01T00:00:00.000Z",
          },
          {
            user_id: "user-2",
            role: "caregiver",
            display_name: "Asha",
            email: "asha@example.com",
            joined_at: "2026-07-02T00:00:00.000Z",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "inv-1",
            invitee_email: "new@example.com",
            invitee_phone_e164: null,
            role: "viewer",
            expires_at: "2026-07-28T00:00:00.000Z",
            created_at: "2026-07-21T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await getMembersRoute();

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      isOwner: boolean;
      members: unknown;
      invitations: unknown;
    };
    expect(body.isOwner).toBe(true);
    expect(body.members).toEqual([
      { userId: "user-1", role: "owner", displayName: "Priya", email: "priya@example.com", joinedAt: "2026-07-01T00:00:00.000Z" },
      { userId: "user-2", role: "caregiver", displayName: "Asha", email: "asha@example.com", joinedAt: "2026-07-02T00:00:00.000Z" },
    ]);
    expect(body.invitations).toEqual([
      {
        id: "inv-1",
        invitedEmail: "new@example.com",
        invitedPhoneE164: null,
        role: "viewer",
        expiresAt: "2026-07-28T00:00:00.000Z",
        createdAt: "2026-07-21T00:00:00.000Z",
      },
    ]);
    expect(client.calls.map((call) => call.fn)).toEqual(["list_household_members", "list_household_invitations"]);
  });

  it("omits pending invitations for a non-owner member (owner-only)", async () => {
    vi.mocked(getSupabaseUserId).mockResolvedValue("user-2");
    const client = createMockSupabase([
      {
        data: [
          {
            user_id: "user-1",
            role: "owner",
            display_name: "Priya",
            email: "priya@example.com",
            joined_at: "2026-07-01T00:00:00.000Z",
          },
          {
            user_id: "user-2",
            role: "caregiver",
            display_name: "Asha",
            email: "asha@example.com",
            joined_at: "2026-07-02T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await getMembersRoute();

    const body = (await response.json()) as { isOwner: boolean; invitations: unknown };
    expect(body.isOwner).toBe(false);
    expect(body.invitations).toEqual([]);
    // list_household_invitations must never be called for a non-owner.
    expect(client.calls.map((call) => call.fn)).toEqual(["list_household_members"]);
  });

  it("removes a household member", async () => {
    const client = createMockSupabase([{ data: null, error: null }]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await removeMemberRoute(jsonRequest("http://localhost/api/household/members/user-2", "DELETE"), {
      params: Promise.resolve({ userId: "user-2" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(client.calls[0]).toEqual({
      fn: "remove_household_member",
      args: { target_user_id: "user-2" },
    });
  });

  it("maps a 42501 remove-member error into a clean AppError", async () => {
    const client = createMockSupabase([
      { data: null, error: { code: "42501", message: "Only the household owner can remove caregiver" } },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);

    const response = await removeMemberRoute(jsonRequest("http://localhost/api/household/members/user-2", "DELETE"), {
      params: Promise.resolve({ userId: "user-2" }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });
});
