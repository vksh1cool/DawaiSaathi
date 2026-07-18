"use client";

import Link from "next/link";
import { ChevronRight, IndianRupee } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { formatInr } from "@/lib/util/money";

export function SavingsBanner({ savings }: { savings: number }) {
  const { t } = useI18n();

  return (
    <Link href="/savings" className="mt-4 block">
      <div className="flex items-center justify-between rounded-[12px] bg-[var(--color-success-soft)] px-4 py-3">
        <span className="flex items-center gap-2 font-medium text-[var(--color-success)]">
          <IndianRupee size={18} />
          {t("home.savingTeaser", { amount: formatInr(savings), per: t("common.perMonth") })}
        </span>
        <ChevronRight size={18} className="text-[var(--color-success)]" />
      </div>
    </Link>
  );
}
