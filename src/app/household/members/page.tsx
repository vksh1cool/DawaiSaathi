"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Ban, Copy, UserX, UsersRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  Banner,
  Card,
  Chip,
  Field,
  GhostButton,
  ModalDialog,
  PrimaryButton,
  Spinner,
  TextInput,
  Toast,
} from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { ApiError, apiGet, apiJson } from "@/lib/api-client";
import { useTimedMessage } from "@/lib/use-timed-message";

type Role = "owner" | "caregiver" | "viewer";
type InviteRole = "caregiver" | "viewer";

type Member = {
  userId: string;
  role: Role;
  displayName: string | null;
  email: string | null;
  joinedAt: string;
};

type Invitation = {
  id: string;
  invitedEmail: string | null;
  invitedPhoneE164: string | null;
  role: Role;
  expiresAt: string;
  createdAt: string;
};

type RosterResponse = {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  isOwner: boolean;
};

export default function HouseholdMembersPage() {
  const { t } = useI18n();
  const { message, showMessage } = useTimedMessage();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [contact, setContact] = useState("");
  const [role, setRole] = useState<InviteRole>("caregiver");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ token: string; expiresAt: string } | null>(null);

  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<Invitation | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    apiGet<RosterResponse>("/api/household/members")
      .then((res) => {
        setMembers(res.members);
        setInvitations(res.invitations);
        setCurrentUserId(res.currentUserId);
        setIsOwner(res.isOwner);
      })
      .catch(() => setLoadError(t("household.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleLabel = (value: Role) =>
    value === "owner"
      ? t("household.roleOwner")
      : value === "caregiver"
        ? t("household.roleCaregiver")
        : t("household.roleViewer");

  const contactLabel = (invitation: Invitation) =>
    invitation.invitedEmail ?? invitation.invitedPhoneE164 ?? "";

  const submitInvite = async () => {
    const trimmed = contact.trim();
    if (!trimmed) return;
    setInviting(true);
    setInviteError(null);
    try {
      const result = await apiJson<{ invitationId: string; inviteToken: string; expiresAt: string }>(
        "/api/household/invitations",
        "POST",
        { contact: trimmed, role },
      );
      setCreatedInvite({ token: result.inviteToken, expiresAt: result.expiresAt });
      setContact("");
      void load();
    } catch (reason) {
      setInviteError(reason instanceof ApiError ? reason.message : t("household.inviteError"));
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = async (token: string) => {
    const link = `${window.location.origin}/invite?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      showMessage(t("household.copyLinkCopied"));
    } catch {
      showMessage(t("household.copyLinkError"));
    }
  };

  const removeMember = async () => {
    if (!confirmRemove) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      await apiJson(`/api/household/members/${confirmRemove.userId}`, "DELETE");
      setConfirmRemove(null);
      showMessage(t("household.removeSuccess"));
      void load();
    } catch (reason) {
      setConfirmError(reason instanceof ApiError ? reason.message : t("household.removeError"));
    } finally {
      setConfirmBusy(false);
    }
  };

  const revokeInvitation = async () => {
    if (!confirmRevoke) return;
    setConfirmBusy(true);
    setConfirmError(null);
    try {
      await apiJson(`/api/household/invitations/${confirmRevoke.id}`, "DELETE");
      setConfirmRevoke(null);
      showMessage(t("household.revokeSuccess"));
      void load();
    } catch (reason) {
      setConfirmError(reason instanceof ApiError ? reason.message : t("household.revokeError"));
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <Spinner label={t("common.loading")} />
      </AppShell>
    );
  }

  if (loadError) {
    return (
      <AppShell>
        <Card tone="warn">
          <p className="text-sm">{loadError}</p>
          <PrimaryButton className="mt-3" onClick={load}>
            {t("common.tryAgain")}
          </PrimaryButton>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label={t("common.back")}
          className="pressable flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-border)]"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold">{t("household.title")}</h1>
      </div>

      <div className="flex flex-col gap-5">
        <Card>
          <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <UsersRound size={18} className="text-[var(--color-primary)]" />
            {t("household.rosterTitle")}
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("household.rosterEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-bg)] p-3 ring-1 ring-[var(--color-border)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                      {member.displayName ?? member.email ?? t("household.unnamedMember")}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                      {t("household.joinedOn", { date: new Date(member.joinedAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Chip selected={member.role === "owner"}>{roleLabel(member.role)}</Chip>
                    {isOwner && member.role !== "owner" && member.userId !== currentUserId && (
                      <button
                        type="button"
                        aria-label={t("household.removeMember")}
                        onClick={() => {
                          setConfirmRemove(member);
                          setConfirmError(null);
                        }}
                        className="pressable flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-danger)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-danger-soft)]"
                      >
                        <UserX size={18} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isOwner && (
          <Card>
            <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
              <UsersRound size={18} className="text-[var(--color-primary)]" />
              {t("household.inviteTitle")}
            </div>
            <div className="flex flex-col gap-3">
              <Field label={t("household.inviteContactLabel")}>
                <TextInput
                  value={contact}
                  disabled={inviting}
                  placeholder={t("household.inviteContactPlaceholder")}
                  onChange={(event) => setContact(event.target.value)}
                  autoComplete="off"
                />
              </Field>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-[var(--color-text-muted)]">
                  {t("household.inviteRoleLabel")}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Chip selected={role === "caregiver"} onClick={() => setRole("caregiver")}>
                    {t("household.roleCaregiver")}
                  </Chip>
                  <Chip selected={role === "viewer"} onClick={() => setRole("viewer")}>
                    {t("household.roleViewer")}
                  </Chip>
                </div>
              </div>
              {inviteError && (
                <Banner tone="danger">
                  <span role="alert">{inviteError}</span>
                </Banner>
              )}
              <PrimaryButton disabled={inviting || !contact.trim()} onClick={() => void submitInvite()}>
                {inviting ? t("household.inviteSubmitting") : t("household.inviteSubmit")}
              </PrimaryButton>
              {createdInvite && (
                <div className="flex flex-col gap-2">
                  <Banner tone="success">
                    <span>{t("household.inviteCreated")}</span>
                  </Banner>
                  <GhostButton onClick={() => void copyInviteLink(createdInvite.token)}>
                    <Copy size={16} />
                    {t("household.copyLink")}
                  </GhostButton>
                </div>
              )}
            </div>
          </Card>
        )}

        {isOwner && (
          <Card>
            <div className="mb-4 flex items-center gap-2 font-semibold text-[var(--color-text)]">
              <UsersRound size={18} className="text-[var(--color-primary)]" />
              {t("household.pendingTitle")}
            </div>
            {invitations.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">{t("household.pendingEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-3 rounded-[12px] bg-[var(--color-bg)] p-3 ring-1 ring-[var(--color-border)]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                        {contactLabel(invitation)}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {t("household.pendingExpires", {
                          date: new Date(invitation.expiresAt).toLocaleDateString(),
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Chip>{roleLabel(invitation.role)}</Chip>
                      <button
                        type="button"
                        aria-label={t("household.revoke")}
                        onClick={() => {
                          setConfirmRevoke(invitation);
                          setConfirmError(null);
                        }}
                        className="pressable flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-danger)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-[var(--color-danger-soft)]"
                      >
                        <Ban size={18} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      {message && <Toast>{message}</Toast>}

      {confirmRemove && (
        <ModalDialog
          title={t("household.removeConfirmTitle")}
          onClose={confirmBusy ? undefined : () => setConfirmRemove(null)}
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            {t("household.removeConfirmBody", {
              name: confirmRemove.displayName ?? confirmRemove.email ?? t("household.unnamedMember"),
            })}
          </p>
          {confirmError && (
            <Banner tone="danger">
              <span role="alert">{confirmError}</span>
            </Banner>
          )}
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={confirmBusy} onClick={() => setConfirmRemove(null)}>
              {t("common.cancel")}
            </GhostButton>
            <PrimaryButton
              className="!bg-[var(--color-danger)] flex-1"
              disabled={confirmBusy}
              onClick={() => void removeMember()}
            >
              {t("household.removeMember")}
            </PrimaryButton>
          </div>
        </ModalDialog>
      )}

      {confirmRevoke && (
        <ModalDialog
          title={t("household.revokeConfirmTitle")}
          onClose={confirmBusy ? undefined : () => setConfirmRevoke(null)}
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">{t("household.revokeConfirmBody")}</p>
          {confirmError && (
            <Banner tone="danger">
              <span role="alert">{confirmError}</span>
            </Banner>
          )}
          <div className="mt-5 flex gap-3">
            <GhostButton className="flex-1" disabled={confirmBusy} onClick={() => setConfirmRevoke(null)}>
              {t("common.cancel")}
            </GhostButton>
            <PrimaryButton
              className="!bg-[var(--color-danger)] flex-1"
              disabled={confirmBusy}
              onClick={() => void revokeInvitation()}
            >
              {t("household.revoke")}
            </PrimaryButton>
          </div>
        </ModalDialog>
      )}
    </AppShell>
  );
}
