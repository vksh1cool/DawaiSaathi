"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ScanModeTabs } from "@/components/ScanModeTabs";
import { MedicinePickerCard } from "@/components/MedicinePickerCard";
import { PrimaryButton, Banner } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { getBrandPrices } from "@/lib/reference-data";
import { searchBrandPrices, draftFromBrandPrice } from "@/lib/reference-picker";

export default function MedicinePickerPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const results = useMemo(() => searchBrandPrices(query), [query]);
  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const toggle = (brandName: string) =>
    setSelected((prev) => ({ ...prev, [brandName]: !prev[brandName] }));

  const proceed = () => {
    const chosen = getBrandPrices().filter((brand) => selected[brand.brandName]);
    if (chosen.length === 0) return;
    const medications = chosen.map(draftFromBrandPrice);
    sessionStorage.setItem(
      "dawaisaathi.scan",
      JSON.stringify({ scanBatchId: null, medications, imageIssues: [] }),
    );
    router.push("/scan/review");
  };

  return (
    <AppShell>
      <ScanModeTabs active="picker" />
      <h1 className="mb-1 text-2xl font-bold">{t("scan.pickerTitle")}</h1>
      <p className="mb-4 text-sm leading-6 text-[var(--color-text-muted)]">{t("scan.pickerSubtitle")}</p>

      <div className="mb-4">
        <Banner tone="info">{t("scan.pickerNotice")}</Banner>
      </div>

      <div className="relative mb-4">
        <Search
          size={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("scan.pickerSearchPlaceholder")}
          className="min-h-[48px] w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] pl-10 pr-10 text-base outline-none focus:border-[var(--color-primary)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("common.close")}
            className="pressable absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[var(--color-text-muted)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--color-text-muted)]">{t("scan.pickerEmpty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {results.map((brand) => (
            <MedicinePickerCard
              key={brand.brandName}
              brand={brand}
              selected={!!selected[brand.brandName]}
              onToggle={() => toggle(brand.brandName)}
            />
          ))}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="fixed bottom-[calc(9rem_+_env(safe-area-inset-bottom))] left-1/2 z-10 w-full max-w-[448px] -translate-x-1/2 px-4">
          <div className="card-shadow flex flex-col gap-2 rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{t("scan.pickerSelectedCount", { n: selectedCount })}</span>
              <button
                type="button"
                onClick={() => setSelected({})}
                className="pressable text-[var(--color-text-muted)] underline underline-offset-2"
              >
                {t("scan.pickerClearSelection")}
              </button>
            </div>
            <PrimaryButton onClick={proceed}>
              {t("scan.pickerAddCta", { n: selectedCount })}
              <ArrowRight size={18} />
            </PrimaryButton>
          </div>
        </div>
      )}
    </AppShell>
  );
}
