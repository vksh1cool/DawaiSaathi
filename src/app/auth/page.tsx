import { safeInternalPath } from "@/lib/safe-redirect";
import { AuthScreen } from "./AuthScreen";

export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const initialError = error === "invalid_link" || error === "expired_link" ? error : undefined;
  return <AuthScreen nextPath={safeInternalPath(next)} initialError={initialError} />;
}
