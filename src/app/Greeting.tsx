"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";

function greetingKey(hour: number): string {
  if (hour >= 4 && hour < 12) return "home.greetingMorning";
  if (hour >= 12 && hour < 17) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

/**
 * Time-of-day greeting for the dashboard. Rendered only on the client so the
 * hour reflects the viewer's device, never the server region.
 */
export function Greeting({ name }: { name: string }) {
  const { t } = useI18n();
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  if (hour === null || !name) return null;

  return (
    <p className="mb-1 text-base font-medium text-[var(--color-text-muted)]">
      {t(greetingKey(hour), { name })}
    </p>
  );
}
