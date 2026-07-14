import en from "./en.json";
import hi from "./hi.json";
import type { Language } from "@/types/domain";

export const dictionaries = { en, hi } as const;
export type Dictionary = typeof en;

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
];

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
  lang: Language,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = resolve(dictionaries[lang], key) ?? resolve(dictionaries.en, key) ?? key;
  return interpolate(raw, vars);
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;
