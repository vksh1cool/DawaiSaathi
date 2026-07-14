"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneCall, PhoneOff, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { apiJson } from "@/lib/api-client";

type StartResponse = {
  reminderCallId: string;
  audio: { medlistUrl: string; menuUrl: string; thanksUrl: string; noinputUrl: string };
};
type DigitsResponse = { action: string; outcome: string; doseStatus: string };

export function SimulatedCallModal({
  time,
  patientName,
  onClose,
}: {
  time: string;
  patientName: string;
  onClose: (resolved: boolean) => void;
}) {
  const { t } = useI18n();
  const [call, setCall] = useState<StartResponse | null>(null);
  const [phase, setPhase] = useState<"ringing" | "playing" | "done">("ringing");
  const [outcome, setOutcome] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    apiJson<StartResponse>("/api/simulate/start", "POST", { time })
      .then((res) => {
        if (!active) return;
        setCall(res);
        setPhase("playing");
        playSequence(res.audio.medlistUrl, res.audio.menuUrl);
        // Auto no-input after 18s of no keypress.
        timeoutRef.current = setTimeout(() => press(""), 18000);
      })
      .catch(() => onClose(false));
    return () => {
      active = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playSequence = (...urls: string[]) => {
    let i = 0;
    const audio = new Audio(urls[i]);
    audioRef.current = audio;
    audio.onended = () => {
      i += 1;
      if (i < urls.length) {
        audio.src = urls[i];
        audio.play().catch(() => {});
      }
    };
    audio.play().catch(() => {});
  };

  const play = (url: string) => {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const press = async (digit: string) => {
    if (!call || phase === "done") return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const res = await apiJson<DigitsResponse>("/api/simulate/digits", "POST", {
      reminderCallId: call.reminderCallId,
      digits: digit,
    });
    if (res.action === "repeat") {
      play(call.audio.medlistUrl);
      timeoutRef.current = setTimeout(() => press(""), 18000);
      return;
    }
    if (res.action === "confirmed") play(call.audio.thanksUrl);
    else play(call.audio.noinputUrl);
    setOutcome(res.outcome);
    setPhase("done");
    setTimeout(() => onClose(true), 2200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="modal-shadow w-full max-w-[320px] rounded-[24px] bg-[var(--color-text)] p-6 text-center text-white">
        {phase !== "done" ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]">
              <PhoneCall size={28} className="animate-pulse" />
            </div>
            <p className="mb-1 text-lg font-semibold">{t("call.simTitle", { name: patientName })}</p>
            <p className="mb-6 text-sm text-white/60">{time}</p>

            <div className="mx-auto grid max-w-[180px] grid-cols-2 gap-3">
              <button
                onClick={() => press("1")}
                className="flex h-16 flex-col items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold active:bg-white/20"
              >
                1
                <span className="text-[10px] font-normal text-white/60">{t("call.outcomeConfirmed")}</span>
              </button>
              <button
                onClick={() => press("2")}
                className="flex h-16 flex-col items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold active:bg-white/20"
              >
                2
                <span className="text-[10px] font-normal text-white/60">{t("call.listen")}</span>
              </button>
            </div>

            <button
              onClick={() => onClose(false)}
              className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger)]"
              aria-label={t("common.close")}
            >
              <PhoneOff size={20} />
            </button>
            <p className="mt-4 text-[11px] text-white/40">{t("call.simFooter")}</p>
          </>
        ) : (
          <div className="py-6">
            {outcome === "confirmed" ? (
              <>
                <CheckCircle2 size={56} className="mx-auto mb-3 text-[var(--color-success)]" />
                <p className="text-lg font-semibold">{t("call.outcomeConfirmed")}</p>
              </>
            ) : (
              <p className="text-lg font-semibold text-white/80">{t("call.outcomeNoInput")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
