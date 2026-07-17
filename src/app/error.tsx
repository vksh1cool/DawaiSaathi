"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, PrimaryButton } from "@/components/ui";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <AppShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
        <Card tone="warn" className="w-full max-w-sm">
          <h2 className="text-lg font-bold">Something went wrong!</h2>
          <p className="mt-2 text-sm text-[var(--color-text)]">
            {error.message || "An unexpected error occurred."}
          </p>
          <PrimaryButton onClick={() => reset()} className="mt-6 w-full">
            Try again
          </PrimaryButton>
        </Card>
      </div>
    </AppShell>
  );
}
