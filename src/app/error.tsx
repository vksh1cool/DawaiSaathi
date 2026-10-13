"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card, PrimaryButton } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    console.error(error);
  }, [error]);

  // error.message is a developer string (in production, Next's generic
  // server-render digest text), so it is logged above rather than shown.
  return (
    <AppShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <Card tone="warn" className="w-full max-w-sm">
          <h1 className="text-lg font-bold">{t("common.errorTitle")}</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{t("common.errorBody")}</p>
          <PrimaryButton onClick={() => reset()} className="mt-6">
            {t("common.tryAgain")}
          </PrimaryButton>
          <Link
            href="/"
            className="pressable mt-3 flex min-h-[48px] items-center justify-center rounded-[12px] font-semibold text-[var(--color-primary)]"
          >
            {t("common.goHome")}
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
