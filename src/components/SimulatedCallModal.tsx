"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneCall, PhoneOff, CheckCircle2 } from "lucide-react";
import { ModalDialog } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiJson } from "@/lib/api-client";
import { speechLocale, type CallLanguage } from "@/lib/languages";
import { applyGenderedVoice, getSpeechVoices, type SpeechGender } from "@/lib/speech";

type StartResponse = {
  reminderCallId: string;
  audio: {
    language: CallLanguage;
    voiceGender: SpeechGender;
    medlistUrl: string | null;
    menuUrl: string | null;
    thanksUrl: string | null;
    noinputUrl: string | null;
    fallback: { medlist: string; menu: string; thanks: string; noinput: string };
  };
};
type DigitsResponse = { action: string; outcome: string; doseStatus: string };
type Clip = { url: string | null; fallback: string };

const NO_INPUT_AFTER_MENU_MS = 8_000;

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
  const [submitting, setSubmitting] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const noInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callRef = useRef<StartResponse | null>(null);
  const settledRef = useRef(false);
  const closedRef = useRef(false);
  const phaseRef = useRef<"ringing" | "playing" | "done">("ringing");
  const submittingRef = useRef(false);
  const playbackTokenRef = useRef(0);
  const pressRef = useRef<(digit: string) => void>(() => undefined);

  const clearNoInputTimer = () => {
    if (noInputTimeoutRef.current) clearTimeout(noInputTimeoutRef.current);
    noInputTimeoutRef.current = null;
  };

  const stopPlayback = () => {
    playbackTokenRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
  };

  const finishModal = (resolved: boolean) => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClose(resolved);
  };

  const dismiss = () => {
    if (!callRef.current) {
      // The request may already have reached the server. Its completion path
      // below sends a no-input result, while the user can leave immediately.
      finishModal(true);
      return;
    }
    void pressRef.current("");
  };

  const speak = (text: string, onEnded?: () => void) => {
    const token = ++playbackTokenRef.current;
    audioRef.current?.pause();
    audioRef.current = null;
    const complete = once(() => {
      if (token === playbackTokenRef.current) onEnded?.();
    });
    if (!("speechSynthesis" in window)) {
      complete();
      return;
    }

    const locale = speechLocale(callRef.current?.audio.language ?? "en");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = locale;
    utterance.rate = 0.9;
    // Keep the simulated call's fallback voice matching the patient's chosen
    // gender rather than defaulting to a single OS voice for both.
    applyGenderedVoice(utterance, locale, callRef.current?.audio.voiceGender ?? "female", getSpeechVoices());
    utterance.onend = complete;
    utterance.onerror = complete;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const play = (clip: Clip, onEnded?: () => void) => {
    if (!clip.url) {
      speak(clip.fallback, onEnded);
      return;
    }

    const token = ++playbackTokenRef.current;
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    const complete = once(() => {
      if (token === playbackTokenRef.current) onEnded?.();
    });
    let usedFallback = false;
    const useFallback = () => {
      if (usedFallback || token !== playbackTokenRef.current) return;
      usedFallback = true;
      speak(clip.fallback, onEnded);
    };
    const audio = new Audio(clip.url);
    audioRef.current = audio;
    audio.onended = complete;
    audio.onerror = useFallback;
    void audio.play().catch(useFallback);
  };

  const playSequence = (clips: Clip[], onComplete?: () => void) => {
    let index = 0;
    const next = () => {
      const clip = clips[index++];
      if (!clip) {
        onComplete?.();
        return;
      }
      play(clip, next);
    };
    next();
  };

  const armNoInputTimer = () => {
    clearNoInputTimer();
    noInputTimeoutRef.current = setTimeout(() => pressRef.current(""), NO_INPUT_AFTER_MENU_MS);
  };

  const playMenu = (activeCall: StartResponse) => {
    clearNoInputTimer();
    playSequence(
      [
        { url: activeCall.audio.medlistUrl, fallback: activeCall.audio.fallback.medlist },
        { url: activeCall.audio.menuUrl, fallback: activeCall.audio.fallback.menu },
      ],
      armNoInputTimer,
    );
  };

  const press = async (digit: string) => {
    const activeCall = callRef.current;
    if (!activeCall || phaseRef.current === "done" || submittingRef.current) return;
    clearNoInputTimer();
    stopPlayback();
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await apiJson<DigitsResponse>("/api/simulate/digits", "POST", {
        reminderCallId: activeCall.reminderCallId,
        digits: digit,
      });
      if (res.action === "repeat") {
        playMenu(activeCall);
        return;
      }
      settledRef.current = true;
      if (res.action === "confirmed") {
        play({ url: activeCall.audio.thanksUrl, fallback: activeCall.audio.fallback.thanks });
      } else {
        play({ url: activeCall.audio.noinputUrl, fallback: activeCall.audio.fallback.noinput });
      }
      setOutcome(res.outcome);
      phaseRef.current = "done";
      setPhase("done");
      closeTimeoutRef.current = setTimeout(() => finishModal(true), 2_200);
    } catch {
      finishModal(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  pressRef.current = (digit) => void press(digit);

  useEffect(() => {
    let active = true;
    apiJson<StartResponse>("/api/simulate/start", "POST", { time })
      .then((res) => {
        if (!active) {
          void apiJson("/api/simulate/digits", "POST", {
            reminderCallId: res.reminderCallId,
            digits: "",
          }).catch(() => undefined);
          return;
        }
        callRef.current = res;
        setCall(res);
        phaseRef.current = "playing";
        setPhase("playing");
        // The no-input countdown starts after the instructions finish, so it
        // cannot cut a slower listener off while the menu is still speaking.
        playMenu(res);
      })
      .catch(() => {
        if (active) finishModal(false);
      });
    return () => {
      active = false;
      clearNoInputTimer();
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
      stopPlayback();
      // A navigation, refresh, or dismiss should not leave a simulated call
      // permanently in `calling`. This mirrors the no-keypress outcome.
      if (callRef.current && !settledRef.current) {
        void apiJson("/api/simulate/digits", "POST", {
          reminderCallId: callRef.current.reminderCallId,
          digits: "",
        }).catch(() => undefined);
      }
    };
    // Helpers deliberately read refs so the one-time call setup cannot close
    // over stale phase or submission state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (phaseRef.current !== "playing" || submittingRef.current) return;
      if (event.key === "1" || event.key === "2") {
        event.preventDefault();
        pressRef.current(event.key);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <ModalDialog
      title={t("call.simTitle", { name: patientName })}
      onClose={dismiss}
      surfaceClassName="bg-[var(--color-text)] text-white"
      titleClassName="text-center text-white"
      className="max-w-[320px] text-center"
    >
      {phase !== "done" ? (
        <>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary)]" aria-hidden="true">
            <PhoneCall size={28} className="animate-pulse" />
          </div>
          <p className="mb-6 text-sm text-white/60">{time}</p>
          <p className="sr-only" role="status" aria-live="polite">
            {call ? t("call.listen") : t("common.loading")}
          </p>

          <div className="mx-auto grid max-w-[180px] grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void press("1")}
              disabled={!call || submitting}
              aria-label={`${t("call.press1")} — ${t("call.outcomeConfirmed")}`}
              className="pressable flex h-16 flex-col items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              1
              <span className="text-[10px] font-normal text-white/60">{t("call.outcomeConfirmed")}</span>
            </button>
            <button
              type="button"
              onClick={() => void press("2")}
              disabled={!call || submitting}
              aria-label={`${t("call.press2")} — ${t("call.listen")}`}
              className="pressable flex h-16 flex-col items-center justify-center rounded-2xl bg-white/10 text-2xl font-bold transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              2
              <span className="text-[10px] font-normal text-white/60">{t("call.listen")}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={dismiss}
            disabled={submitting}
            className="pressable mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-danger)] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <PhoneOff size={20} />
          </button>
          <p className="mt-4 text-[11px] text-white/40">{t("call.simFooter")}</p>
        </>
      ) : (
        <div className="py-6" role="status" aria-live="polite">
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
    </ModalDialog>
  );
}

function once(callback: () => void) {
  let called = false;
  return () => {
    if (called) return;
    called = true;
    callback();
  };
}
