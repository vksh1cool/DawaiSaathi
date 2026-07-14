"use client";

import { PhoneMissed, Phone, PhoneForwarded, PlayCircle, PauseCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { DateTime } from "luxon";
import { Card } from "./ui";
import { useRef, useState } from "react";

export type CallLog = {
  id: string;
  time: string; // HH:mm
  slotKey: string;
  mode: string;
  attempt: number;
  twilioStatus: string | null;
  outcome: string | null;
  digitsPressed: string | null;
  doseCount: number;
  medlistUrl: string | null;
  createdAt: string; // ISO
};

export function CallLogRow({ log }: { log: CallLog }) {
  const { t, lang } = useI18n();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const getStatusDisplay = () => {
    if (log.outcome === "confirmed") {
      return {
        icon: <Phone size={18} className="text-[var(--color-success)]" />,
        text: t("history.callConfirmed", { attempt: log.attempt }),
        color: "text-[var(--color-success)]",
      };
    }
    if (log.outcome === "not_answered") {
      return {
        icon: <PhoneMissed size={18} className="text-[var(--color-danger)]" />,
        text: t("history.callMissed", { attempt: log.attempt }),
        color: "text-[var(--color-danger)]",
      };
    }
    if (log.outcome === "no_input") {
      return {
        icon: <PhoneForwarded size={18} className="text-[var(--color-warning)]" />,
        text: t("history.callNoInput", { attempt: log.attempt }),
        color: "text-[var(--color-warning)]",
      };
    }
    return {
      icon: <Phone size={18} className="text-[var(--color-text-muted)]" />,
      text: t("history.callPending", { attempt: log.attempt }),
      color: "text-[var(--color-text-muted)]",
    };
  };

  const status = getStatusDisplay();
  const relTime = DateTime.fromISO(log.createdAt).toFormat("LLL d, t");
  const slotName = t(`schedule.slots.${log.slotKey}`);

  return (
    <Card className="flex flex-col gap-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-bg)] ${status.color}`}>
            {status.icon}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {slotName} • {log.time}
            </div>
            <div className={`text-xs font-medium ${status.color}`}>{status.text}</div>
          </div>
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">{relTime}</div>
      </div>
      
      {log.medlistUrl && (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-[var(--color-bg)] px-3 py-2">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            {t("history.audioPreview")}
          </span>
          <button
            onClick={() => {
              if (playing) {
                audioRef.current?.pause();
                setPlaying(false);
              } else {
                audioRef.current?.play();
                setPlaying(true);
              }
            }}
            className="flex items-center justify-center rounded-full bg-[var(--color-primary-soft)] p-2 text-[var(--color-primary)] transition-colors active:bg-[var(--color-primary)] active:text-white"
          >
            {playing ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
          </button>
          <audio
            ref={audioRef}
            src={log.medlistUrl}
            onEnded={() => setPlaying(false)}
            onPause={() => setPlaying(false)}
            className="hidden"
          />
        </div>
      )}
    </Card>
  );
}
