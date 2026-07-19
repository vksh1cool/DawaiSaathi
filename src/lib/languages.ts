/**
 * One source of truth for app and reminder languages. The app UI exposes only
 * complete reviewed dictionaries, while reminder calls can use a broader set
 * of carefully authored spoken-language scripts.
 *
 * `twilioLocale` is deliberately nullable: a language without a Twilio
 * <Say> locale must use generated audio for a live phone call rather than
 * silently being read in an unrelated language.
 */
export const APP_LANGUAGE_CODES = ["en", "hi", "es"] as const;
export type AppLanguage = (typeof APP_LANGUAGE_CODES)[number];

export type AppLanguageMeta = {
  code: AppLanguage;
  nativeName: string;
  englishName: string;
  shortLabel: string;
  direction: "ltr" | "rtl";
};

export const APP_LANGUAGES: readonly AppLanguageMeta[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    shortLabel: "EN",
    direction: "ltr",
  },
  {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    shortLabel: "हि",
    direction: "ltr",
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    shortLabel: "ES",
    direction: "ltr",
  },
] as const;

export const CALL_LANGUAGE_CODES = [
  "en",
  "hi",
  "es",
  "bn",
  "ur",
  "ta",
  "te",
  "mr",
  "gu",
  "pa",
  "ar",
  "fr",
  "pt",
  "zh",
  "id",
  "ms",
  "sw",
  "ha",
  "yo",
  "af",
  "am",
  "de",
  "it",
  "ja",
  "ko",
  "ru",
  "tr",
  "vi",
  "th",
  "fa",
  "nl",
  "pl",
] as const;
export type CallLanguage = (typeof CALL_LANGUAGE_CODES)[number];
/** Reviewed, low-information SMS templates currently exist only in these languages. */
export const SMS_REMINDER_LANGUAGE_CODES = ["en", "hi"] as const;
export type SmsReminderLanguage = (typeof SMS_REMINDER_LANGUAGE_CODES)[number];
export type TwilioVoiceLocale = "en-IN" | "hi-IN" | "bn-IN" | "ar-XA" | "fr-FR" | "pt-PT" | "af-ZA" | "am-ET" | "es-US";

export type CallLanguageMeta = {
  code: CallLanguage;
  nativeName: string;
  englishName: string;
  region: string;
  /** BCP 47 locale used by browser speech synthesis and generated audio. */
  speechLocale: string;
  /** Locale configured in Twilio Console Language Mapping, if one exists. */
  twilioLocale: TwilioVoiceLocale | null;
  direction: "ltr" | "rtl";
};

export const CALL_LANGUAGES: readonly CallLanguageMeta[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    region: "Global",
    speechLocale: "en-IN",
    twilioLocale: "en-IN",
    direction: "ltr",
  },
  {
    code: "hi",
    nativeName: "हिन्दी",
    englishName: "Hindi",
    region: "South Asia",
    speechLocale: "hi-IN",
    twilioLocale: "hi-IN",
    direction: "ltr",
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    region: "Global",
    speechLocale: "es-US",
    twilioLocale: "es-US",
    direction: "ltr",
  },
  {
    code: "bn",
    nativeName: "বাংলা",
    englishName: "Bengali",
    region: "South Asia",
    speechLocale: "bn-IN",
    twilioLocale: "bn-IN",
    direction: "ltr",
  },
  {
    code: "ur",
    nativeName: "اردو",
    englishName: "Urdu",
    region: "South Asia",
    speechLocale: "ur-PK",
    twilioLocale: null,
    direction: "rtl",
  },
  {
    code: "ta",
    nativeName: "தமிழ்",
    englishName: "Tamil",
    region: "South Asia",
    speechLocale: "ta-IN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "te",
    nativeName: "తెలుగు",
    englishName: "Telugu",
    region: "South Asia",
    speechLocale: "te-IN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "mr",
    nativeName: "मराठी",
    englishName: "Marathi",
    region: "South Asia",
    speechLocale: "mr-IN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "gu",
    nativeName: "ગુજરાતી",
    englishName: "Gujarati",
    region: "South Asia",
    speechLocale: "gu-IN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "pa",
    nativeName: "ਪੰਜਾਬੀ",
    englishName: "Punjabi",
    region: "South Asia",
    speechLocale: "pa-IN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ar",
    nativeName: "العربية",
    englishName: "Arabic",
    region: "North Africa & Middle East",
    speechLocale: "ar-XA",
    twilioLocale: "ar-XA",
    direction: "rtl",
  },
  {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    region: "Africa & Global",
    speechLocale: "fr-FR",
    twilioLocale: "fr-FR",
    direction: "ltr",
  },
  {
    code: "pt",
    nativeName: "Português",
    englishName: "Portuguese",
    region: "Africa & Global",
    speechLocale: "pt-PT",
    twilioLocale: "pt-PT",
    direction: "ltr",
  },
  {
    code: "zh",
    nativeName: "中文",
    englishName: "Mandarin Chinese",
    region: "East Asia & Global",
    speechLocale: "zh-CN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "id",
    nativeName: "Bahasa Indonesia",
    englishName: "Indonesian",
    region: "Southeast Asia",
    speechLocale: "id-ID",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ms",
    nativeName: "Bahasa Melayu",
    englishName: "Malay",
    region: "Southeast Asia",
    speechLocale: "ms-MY",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "sw",
    nativeName: "Kiswahili",
    englishName: "Swahili",
    region: "East & Central Africa",
    speechLocale: "sw-KE",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ha",
    nativeName: "Hausa",
    englishName: "Hausa",
    region: "West Africa",
    speechLocale: "ha-NG",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "yo",
    nativeName: "Yorùbá",
    englishName: "Yoruba",
    region: "West Africa",
    speechLocale: "yo-NG",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "af",
    nativeName: "Afrikaans",
    englishName: "Afrikaans",
    region: "Southern Africa",
    speechLocale: "af-ZA",
    twilioLocale: "af-ZA",
    direction: "ltr",
  },
  {
    code: "am",
    nativeName: "አማርኛ",
    englishName: "Amharic",
    region: "Horn of Africa",
    speechLocale: "am-ET",
    twilioLocale: "am-ET",
    direction: "ltr",
  },
  {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    region: "Europe",
    speechLocale: "de-DE",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "it",
    nativeName: "Italiano",
    englishName: "Italian",
    region: "Europe",
    speechLocale: "it-IT",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    region: "East Asia",
    speechLocale: "ja-JP",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    region: "East Asia",
    speechLocale: "ko-KR",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    region: "Europe & Central Asia",
    speechLocale: "ru-RU",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    region: "Europe & West Asia",
    speechLocale: "tr-TR",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "vi",
    nativeName: "Tiếng Việt",
    englishName: "Vietnamese",
    region: "Southeast Asia",
    speechLocale: "vi-VN",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "th",
    nativeName: "ไทย",
    englishName: "Thai",
    region: "Southeast Asia",
    speechLocale: "th-TH",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "fa",
    nativeName: "فارسی",
    englishName: "Persian",
    region: "West & Central Asia",
    speechLocale: "fa-IR",
    twilioLocale: null,
    direction: "rtl",
  },
  {
    code: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    region: "Europe",
    speechLocale: "nl-NL",
    twilioLocale: null,
    direction: "ltr",
  },
  {
    code: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    region: "Europe",
    speechLocale: "pl-PL",
    twilioLocale: null,
    direction: "ltr",
  },
] as const;

const byCode = new Map(CALL_LANGUAGES.map((language) => [language.code, language]));
const appByCode = new Map(APP_LANGUAGES.map((language) => [language.code, language]));

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === "string" && (APP_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function appLanguageMeta(language: AppLanguage): AppLanguageMeta {
  return appByCode.get(language) ?? APP_LANGUAGES[0];
}

export function isCallLanguage(value: unknown): value is CallLanguage {
  return typeof value === "string" && (CALL_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function isSmsReminderLanguage(value: unknown): value is SmsReminderLanguage {
  return typeof value === "string" && (SMS_REMINDER_LANGUAGE_CODES as readonly string[]).includes(value);
}

export function callLanguageMeta(language: CallLanguage): CallLanguageMeta {
  // The type makes this total. Keeping the fallback prevents a malformed
  // persisted legacy value from crashing a reminder path at runtime.
  return byCode.get(language) ?? CALL_LANGUAGES[0];
}

export function speechLocale(language: CallLanguage): string {
  return callLanguageMeta(language).speechLocale;
}

export function twilioVoiceLocale(language: CallLanguage): TwilioVoiceLocale | null {
  return callLanguageMeta(language).twilioLocale;
}
