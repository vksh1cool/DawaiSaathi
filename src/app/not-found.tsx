"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, PrimaryButton } from "@/components/ui";

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4 text-center">
        <Card className="w-full max-w-sm">
          <h2 className="text-lg font-bold">Page Not Found</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            The page you are looking for does not exist.
          </p>
          <Link href="/" className="mt-6 block w-full">
            <PrimaryButton className="w-full">
              Go Home
            </PrimaryButton>
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
