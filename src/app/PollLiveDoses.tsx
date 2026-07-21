"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { DoseGroupCard } from "@/components/DoseGroupCard";
import { SimulatedCallModal } from "@/components/SimulatedCallModal";
import { Card, Toast } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { useAppInfo } from "@/lib/app-info";
import { apiGet, apiJson, ApiError } from "@/lib/api-client";
import { useTimedMessage } from "@/lib/use-timed-message";
import { fireDoseAlarm } from "@/lib/alarms";
import type { TodayGroup } from "@/types/domain";

type Today = { groups: TodayGroup[] };

export function PollLiveDoses({
  initialToday,
  patientName,
}: {
  initialToday: Today;
  patientName: string;
}) {
  const { t } = useI18n();
  const { info } = useAppInfo();
  const [today, setToday] = useState<Today>(initialToday);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [dueNowTimes, setDueNowTimes] = useState<Set<string>>(new Set());
  const firedAlarmsRef = useRef<Set<string>>(new Set());
  const { message, showMessage } = useTimedMessage();

  const loadTodayStatus = useCallback(async (signal?: AbortSignal) => {
    try {
      const todayRes = await apiGet<Today>("/api/today", { signal });
      if (signal?.aborted) return;
      setToday(todayRes);
    } catch (err: any) {
      if (err.name !== "AbortError") console.error(err);
    }
  }, []);

  // Poll while any dose is still upcoming/calling (captures the live "confirmed" flip).
  useEffect(() => {
    const live = today.groups.some((g) => g.status === "upcoming");
    if (!live) return;

    let pollAbort: AbortController | null = null;
    const poll = async () => {
      pollAbort = new AbortController();
      await loadTodayStatus(pollAbort.signal);
    };

    const id = setInterval(poll, 5000);
    return () => {
      clearInterval(id);
      pollAbort?.abort();
    };
  }, [today, loadTodayStatus]);

  // Foreground due-now alert (Tier 1): complements, never replaces, the Twilio call —
  // ticks independently of the network poll so the pulse/notification lands on time.
  useEffect(() => {
    const upcoming = today.groups.filter((g) => g.status === "upcoming");
    if (upcoming.length === 0) {
      setDueNowTimes(new Set());
      return;
    }

    const tick = () => {
      const now = Date.now();
      const due = new Set<string>();
      for (const g of upcoming) {
        if (new Date(g.scheduledAtUtc).getTime() > now) continue;
        due.add(g.time);
        if (!firedAlarmsRef.current.has(g.time)) {
          firedAlarmsRef.current.add(g.time);
          fireDoseAlarm(g.time, t("alarms.dueNowTitle"), t("alarms.dueNowBody", { name: patientName }));
        }
      }
      setDueNowTimes(due);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [today, patientName, t]);

  const callNow = async (time: string) => {
    try {
      const result = await apiJson<{ placed: boolean }>("/api/calls/now", "POST", { time });
      if (!result.placed) throw new ApiError("UPSTREAM_TWILIO", t("home.callFailed"));
      showMessage(t("home.callStarting", { name: patientName }));
      void loadTodayStatus();
    } catch (e) {
      if (e instanceof ApiError && e.code === "TELEPHONY_DISABLED") setSimTime(time);
      else showMessage(e instanceof ApiError ? e.message : t("home.callFailed"));
    }
  };

  const markGroup = async (group: TodayGroup) => {
    try {
      await apiJson("/api/dose-events/group/mark", "POST", { doseEventIds: group.doseEventIds });
      void loadTodayStatus();
    } catch (error) {
      showMessage(error instanceof ApiError ? error.message : t("home.markFailed"));
    }
  };

  const allDone =
    today.groups.length > 0 && today.groups.every((g) => g.status === "confirmed");

  return (
    <div className="flex flex-col gap-3">
      {allDone && (
        <div
          role="status"
          className="dose-group-card flex items-center gap-3 rounded-[var(--radius-card)] bg-[var(--color-success-soft)] px-4 py-3.5"
        >
          <span aria-hidden="true" className="text-2xl">🎉</span>
          <div>
            <p className="font-bold text-[var(--color-success)]">{t("home.allDoneTitle")}</p>
            <p className="text-sm text-[var(--color-success)]">
              {t("home.allDoneBody", { name: patientName })}
            </p>
          </div>
        </div>
      )}
      {today.groups.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">{t("history.empty")}</p>
          <Link href="/schedule" className="mt-2 inline-block text-sm font-medium text-[var(--color-primary)]">
            {t("schedule.title")} →
          </Link>
        </Card>
      ) : (
        today.groups.map((g, index) => (
          <div key={g.time} className="dose-group-card" style={{ animationDelay: `${index * 60}ms` }}>
            <DoseGroupCard
              group={g}
              patientName={patientName}
              demoMode={info?.demoMode ?? false}
              dueNow={dueNowTimes.has(g.time)}
              onCallNow={callNow}
              onSimulate={(time) => setSimTime(time)}
              onMark={markGroup}
            />
          </div>
        ))
      )}

      {message && <Toast>{message}</Toast>}

      {simTime && (
        <SimulatedCallModal
          time={simTime}
          patientName={patientName}
          onClose={(resolved) => {
            setSimTime(null);
            if (!resolved) showMessage(t("call.simFailed"));
            void loadTodayStatus();
          }}
        />
      )}
    </div>
  );
}
