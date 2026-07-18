"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiJson } from "@/lib/api-client";
import { useTimedMessage } from "@/lib/use-timed-message";
import { Toast } from "@/components/ui";

type CaregiverAlert = {
  id: string;
  type: string;
  messageEn: string;
  messageHi: string;
  read: boolean;
  createdAt: string;
};

export function AlertsList({ initialAlerts }: { initialAlerts: CaregiverAlert[] }) {
  const { t, lang } = useI18n();
  const [alerts, setAlerts] = useState<CaregiverAlert[]>(initialAlerts);
  const { message, showMessage } = useTimedMessage();

  const markAlertRead = async (alertId: string) => {
    try {
      await apiJson(`/api/alerts/${encodeURIComponent(alertId)}/read`, "POST");
      setAlerts((current) => current.map((alert) => (alert.id === alertId ? { ...alert, read: true } : alert)));
    } catch {
      showMessage(t("home.alertReadError"));
    }
  };

  const unreadAlerts = alerts.filter((alert) => !alert.read);
  const latestAlert = unreadAlerts[0];

  if (!latestAlert) return null;

  return (
    <>
      <div className="mb-3" aria-live="polite">
        <Card tone="warn">
          <div className="flex items-start gap-3">
            <BellRing size={21} className="mt-0.5 shrink-0 text-[var(--color-warn)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t("home.followUpTitle")}</p>
              <p className="mt-1 text-sm leading-5 text-[var(--color-text)]">
                {lang === "hi" ? latestAlert.messageHi : latestAlert.messageEn}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void markAlertRead(latestAlert.id)}
                  className="pressable min-h-[44px] rounded-[10px] bg-[var(--color-surface)] px-3 text-sm font-semibold text-[var(--color-primary)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)]"
                >
                  {t("home.markAlertRead")}
                </button>
                <Link
                  href="/history"
                  className="pressable flex min-h-[44px] items-center rounded-[10px] px-2 text-sm font-semibold text-[var(--color-primary)]"
                >
                  {unreadAlerts.length > 1 ? t("home.followUpMore", { n: unreadAlerts.length }) : t("home.history")}
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
      {message && <Toast>{message}</Toast>}
    </>
  );
}
