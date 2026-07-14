"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Language } from "@/types/domain";
import { translate, type TFunction } from "./index";

type I18nContextValue = {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TFunction;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "dawaisaathi.lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  // Hydrate saved preference on mount.
  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem(STORAGE_KEY)) as Language | null;
    if (saved === "en" || saved === "hi") setLangState(saved);
  }, []);

  // Keep <html lang> in sync (drives Devanagari font sizing in globals.css).
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback<TFunction>((key, vars) => translate(lang, key, vars), [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
