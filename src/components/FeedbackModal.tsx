"use client";

import { useState } from "react";
import { Heart, Lightbulb } from "lucide-react";
import { ModalDialog, Field, TextInput, PrimaryButton, GhostButton, Banner } from "./ui";
import { useI18n } from "@/lib/i18n/provider";
import { apiJson } from "@/lib/api-client";

export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<"improvement" | "appreciation">("improvement");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    if (website || Date.now() - openedAt < 800) {
      setSent(true); // Honeypot/bot trap
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiJson("/api/feedback", "POST", { kind, message, email, locale: lang, website, openedAt });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("feedback.sendError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalDialog title={t("feedback.title")} onClose={onClose}>
      {sent ? (
        <div className="flex flex-col gap-4">
          <Banner tone="success">{t("feedback.sent")}</Banner>
          <PrimaryButton onClick={onClose}>{t("common.close")}</PrimaryButton>
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm leading-5 text-[var(--color-text-muted)]">{t("feedback.privacy")}</p>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("feedback.typeLabel")}>
          <button
            type="button"
            aria-pressed={kind === "improvement"}
            onClick={() => setKind("improvement")}
            className={`pressable flex min-h-[72px] flex-col items-start justify-center rounded-[12px] border p-3 text-left ${kind === "improvement" ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"}`}
          >
            <Lightbulb size={18} aria-hidden="true" />
            <span className="mt-1 text-sm font-semibold">{t("feedback.improvement")}</span>
          </button>
          <button
            type="button"
            aria-pressed={kind === "appreciation"}
            onClick={() => setKind("appreciation")}
            className={`pressable flex min-h-[72px] flex-col items-start justify-center rounded-[12px] border p-3 text-left ${kind === "appreciation" ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary)]" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"}`}
          >
            <Heart size={18} aria-hidden="true" />
            <span className="mt-1 text-sm font-semibold">{t("feedback.appreciation")}</span>
          </button>
        </div>
        <Field label={kind === "improvement" ? t("feedback.improvementPrompt") : t("feedback.appreciationPrompt")}>
          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px] w-full rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 pb-8 text-base text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
              required
              maxLength={1200}
              placeholder={kind === "improvement" ? t("feedback.improvementPlaceholder") : t("feedback.appreciationPlaceholder")}
            />
            <span className={`absolute bottom-2 right-3 text-xs ${message.length >= 1150 ? 'text-[var(--color-warn)]' : 'text-[var(--color-text-muted)]'}`}>
              {message.length}/1200
            </span>
          </div>
        </Field>
        <Field label={t("feedback.emailOptional")}>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("feedback.emailPlaceholder")}
          />
        </Field>
        <input
          type="text"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="hidden"
          aria-hidden="true"
        />
        {error && <Banner tone="warn">{error}</Banner>}
        <div className="mt-2 flex gap-2">
          <GhostButton type="button" onClick={onClose} className="flex-1">
            {t("common.cancel")}
          </GhostButton>
          <PrimaryButton type="submit" disabled={loading} className="flex-1">
            {loading ? t("feedback.sending") : t("feedback.send")}
          </PrimaryButton>
        </div>
      </form>
      )}
    </ModalDialog>
  );
}
