"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ShieldQuestion,
  CheckCircle2,
  AlertTriangle,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { getAuthenticityCheck, type AuthenticityInput } from "@/lib/authenticity";

const TONE_COLOR = {
  ok: "text-[var(--color-success)]",
  warn: "text-[var(--color-warn)]",
  info: "text-[var(--color-info)]",
  muted: "text-[var(--color-text-muted)]",
} as const;

function Row({
  icon: Icon,
  text,
  tone = "muted",
}: {
  icon: LucideIcon;
  text: string;
  tone?: keyof typeof TONE_COLOR;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={16} className={`mt-0.5 shrink-0 ${TONE_COLOR[tone]}`} />
      <span className="text-[var(--color-text)]">{text}</span>
    </div>
  );
}

export function AuthenticityCard({
  input,
  collapsible = true,
}: {
  input: AuthenticityInput;
  collapsible?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!collapsible);
  const check = useMemo(() => getAuthenticityCheck(input), [input]);

  const body = (
    <div className="flex flex-col gap-2">
      <p className="text-xs italic text-[var(--color-text-muted)]">{t("authenticity.disclaimer")}</p>

      {!check.catalogMatch && <Row icon={ShieldQuestion} text={t("authenticity.noCatalogMatch")} />}

      {check.catalogMatch && (
        <>
          {check.manufacturerStatus === "match" && (
            <Row
              icon={CheckCircle2}
              tone="ok"
              text={t("authenticity.manufacturerMatch", { manufacturer: check.catalogMatch.manufacturer })}
            />
          )}
          {check.manufacturerStatus === "mismatch" && (
            <Row
              icon={AlertTriangle}
              tone="warn"
              text={t("authenticity.manufacturerMismatch", { catalog: check.catalogMatch.manufacturer })}
            />
          )}
          {check.mrpStatus === "within_range" && (
            <Row
              icon={CheckCircle2}
              tone="ok"
              text={t("authenticity.mrpWithinRange", { catalogMrp: String(check.catalogMatch.mrpInr ?? "") })}
            />
          )}
          {check.mrpStatus === "out_of_range" && (
            <Row
              icon={AlertTriangle}
              tone="warn"
              text={t("authenticity.mrpOutOfRange", { catalogMrp: String(check.catalogMatch.mrpInr ?? "") })}
            />
          )}
        </>
      )}

      {(!check.expiryPresent || !check.batchPresent) && (
        <Row icon={AlertTriangle} tone="warn" text={t("authenticity.detailsIncomplete")} />
      )}

      {check.janAushadhi && (
        <Row
          icon={Tag}
          tone="info"
          text={t("authenticity.janAushadhiNote", {
            generic: check.janAushadhi.genericName,
            mrp: String(check.janAushadhi.mrpInr ?? ""),
          })}
        />
      )}
    </div>
  );

  if (!collapsible) {
    return (
      <Card className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)]">{t("authenticity.sectionTitle")}</p>
        {body}
      </Card>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex min-h-[44px] items-center gap-1 rounded-[10px] px-2 text-sm font-medium text-[var(--color-primary)] transition-transform duration-150 ease-[var(--ease-out)]"
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {t("authenticity.sectionTitle")}
      </button>
      {open && <div className="mt-1 flex flex-col gap-2 px-2">{body}</div>}
    </div>
  );
}
