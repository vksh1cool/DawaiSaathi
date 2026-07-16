"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, PrimaryButton, Spinner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiGet } from "@/lib/api-client";
import { formatInr } from "@/lib/util/money";
import type { GenericMatchResult } from "@/types/domain";

type GenericsResponse = { matches: GenericMatchResult[]; totalMonthlySavingsInr: number };

export default function SavingsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<GenericsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await apiGet<GenericsResponse>("/api/generics"));
    } catch {
      setError(t("savings.loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <AppShell>
        {error ? (
          <Card tone="warn">
            <p className="text-sm">{error}</p>
            <PrimaryButton className="mt-3" onClick={() => void load()}>
              {t("common.tryAgain")}
            </PrimaryButton>
          </Card>
        ) : (
          <Spinner label={t("common.loading")} />
        )}
      </AppShell>
    );
  }

  const yearly = data.totalMonthlySavingsInr * 12;
  const hasSavings = data.totalMonthlySavingsInr > 0;

  return (
    <AppShell>
      <h1 className="mb-3 text-2xl font-bold">{t("savings.title")}</h1>

      <Card tone={hasSavings ? "success" : "info"} className="mb-4 text-center">
        {hasSavings ? (
          <>
            <p className="text-[34px] font-bold leading-tight text-[var(--color-success)]">
              {formatInr(data.totalMonthlySavingsInr)}
              <span className="text-lg font-semibold"> {t("savings.heroPer")}</span>
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("savings.heroYear", { amount: formatInr(yearly) })}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-[var(--color-text)]">{t("savings.noSavingsSummary")}</p>
        )}
      </Card>

      <div className="flex flex-col gap-3">
        {data.matches.length > 0 ? (
          data.matches.map((m) => <SavingsRow key={m.id} match={m} />)
        ) : (
          <Card>
            <p className="text-sm text-[var(--color-text-muted)]">{t("savings.empty")}</p>
          </Card>
        )}
      </div>

      <p className="mt-5 text-sm font-medium text-[var(--color-text-muted)]">{t("savings.caption")}</p>

      <a
        href="https://janaushadhi.gov.in/KendraDetails.aspx"
        target="_blank"
        rel="noopener noreferrer"
        className="pressable mt-3 flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-[var(--color-primary)] px-4 font-semibold text-[var(--color-primary)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
      >
        {t("savings.findKendra")} <ExternalLink size={16} />
      </a>
    </AppShell>
  );
}

function SavingsRow({ match }: { match: GenericMatchResult }) {
  const { t } = useI18n();

  if (!match.jaProductName) {
    return (
      <Card className="opacity-70">
        <p className="font-semibold">{match.brandName}</p>
        <p className="text-sm text-[var(--color-text-muted)]">{t("savings.noMatch")}</p>
      </Card>
    );
  }

  const low = match.confidence === "low";
  const confLabel =
    match.confidence === "high"
      ? t("savings.confHigh")
      : match.confidence === "medium"
        ? t("savings.confMedium")
        : t("savings.confLow");

  return (
    <Card className={low ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">
            {match.brandName} <span className="text-[var(--color-text-muted)]">→ {match.jaProductName}</span>
          </p>
          {match.brandUnitPriceInr != null && match.jaUnitPriceInr != null && (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("savings.perUnit", {
                brand: formatInr(match.brandUnitPriceInr, { decimals: 2 }),
                ja: formatInr(match.jaUnitPriceInr, { decimals: 2 }),
              })}
            </p>
          )}
        </div>
        <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--color-primary)]">
          {confLabel}
        </span>
      </div>
      {match.monthlySavingsInr != null && !low && (
        <p className="mt-1 font-semibold text-[var(--color-success)]">
          {t("savings.saves", { amount: formatInr(match.monthlySavingsInr), per: t("common.perMonth") })}
          {match.estimated ? ` (${t("savings.estimated")})` : ""}
        </p>
      )}
    </Card>
  );
}
