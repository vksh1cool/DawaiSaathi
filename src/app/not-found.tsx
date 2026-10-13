"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <AppShell>
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <Card className="w-full max-w-sm">
          <h1 className="text-lg font-bold">{t("common.notFoundTitle")}</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{t("common.notFoundBody")}</p>
          <Link
            href="/"
            className="pressable mt-6 flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--color-primary)] px-5 text-base font-semibold text-white transition-transform duration-150 ease-[var(--ease-out)]"
          >
            {t("common.goHome")}
          </Link>
        </Card>
      </div>
    </AppShell>
  );
}
