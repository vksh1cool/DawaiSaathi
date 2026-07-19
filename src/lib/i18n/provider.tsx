"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { isAppLanguage, appLanguageMeta, type AppLanguage } from "@/lib/languages";
import { translate, type TFunction } from "./index";

type I18nContextValue = {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: TFunction;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "dawaisaathi.lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>("en");

  // Hydrate saved preference on mount.
  useEffect(() => {
    const saved = (typeof window !== "undefined" &&
      window.localStorage.getItem(STORAGE_KEY)) as string | null;
    if (isAppLanguage(saved)) setLangState(saved);
  }, []);

  // Keep <html lang> and <html dir> in sync (drives Devanagari font sizing and RTL layout).
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = appLanguageMeta(lang).direction;
    }
  }, [lang]);

  const setLang = useCallback((next: AppLanguage) => {
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
