import { InviteAcceptForm } from "./InviteAcceptForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const validToken = typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
  return <InviteAcceptForm token={validToken} />;
}
