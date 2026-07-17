"use client";

import { Camera, CircleHelp, PackageSearch, ShieldAlert, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { getPackCheck } from "@/lib/pack-check";
import type { DraftMedication } from "@/types/domain";

/**
 * Keeps "fake medicine" language honest. It provides the next practical
 * action without implying that OCR, a barcode, or a photo can authenticate a
 * pharmaceutical product.
 */
export function PackCheckCard({ draft }: { draft: DraftMedication }) {
  const { t } = useI18n();
  const check = getPackCheck(draft);
  const content = {
    expired: {
      icon: ShieldAlert,
      className: "border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
      title: t("review.packExpiredTitle"),
      body: t("review.packExpiredBody"),
    },
    needs_clearer_photo: {
      icon: Camera,
      className: "border-[var(--color-warn)]/25 bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
      title: t("review.packUnclearTitle"),
      body: t("review.packUnclearBody"),
    },
    needs_pack_details: {
      icon: PackageSearch,
      className: "border-[var(--color-warn)]/25 bg-[var(--color-warn-soft)] text-[var(--color-warn)]",
      title: t("review.packDetailsTitle"),
      body: t("review.packDetailsBody", { fields: detailNames(check.missing, t) }),
    },
    details_captured: {
      icon: ShieldCheck,
      className: "border-[var(--color-info)]/20 bg-[var(--color-info-soft)] text-[var(--color-info)]",
      title: t("review.packCapturedTitle"),
      body: t("review.packCapturedBody"),
    },
  }[check.state];
  const Icon = content.icon;

  return (
    <div className={`flex items-start gap-2 rounded-[12px] border px-3 py-2.5 text-sm ${content.className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">{content.title}</p>
        <p className="mt-0.5 leading-5">{content.body}</p>
        <p className="mt-1.5 flex items-start gap-1 text-xs leading-5 opacity-90">
          <CircleHelp size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("review.packNotVerdict")}
        </p>
      </div>
    </div>
  );
}

function detailNames(
  details: ReturnType<typeof getPackCheck>["missing"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return details.map((detail) => t(`review.packDetail${detail[0]!.toUpperCase()}${detail.slice(1)}`)).join(", ");
}
