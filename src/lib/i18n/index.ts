import en from "./en.json";
import es from "./es.json";
import hi from "./hi.json";
import bn from "./bn.json";
import ta from "./ta.json";
import te from "./te.json";
import mr from "./mr.json";
import gu from "./gu.json";
import { APP_LANGUAGES, APP_LANGUAGE_CODES, type AppLanguage } from "@/lib/languages";

export const dictionaries = { en, hi, es, bn, ta, te, mr, gu } as const;
export type Dictionary = typeof en;

export const LANGUAGES: { code: AppLanguage; label: string }[] = APP_LANGUAGES.map((language) => ({
  code: language.code,
  label: language.nativeName,
}));

/** Resolve a dotted key path against a dictionary. */
function resolve(dict: unknown, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Interpolate {var} placeholders. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/** Translate a key. Falls back to English, then to the raw key. */
export function translate(
  lang: AppLanguage,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key) ?? key;
  return interpolate(raw, vars);
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

export { APP_LANGUAGE_CODES };
