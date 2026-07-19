import { DateTime } from "luxon";
import type { CallLanguage } from "@/lib/languages";

/**
 * Time helpers. All storage is UTC; conversions happen at the edges
 * (materialization input, UI display, IVR text) using the patient's tz.
 */

/** Convert a local calendar date + "HH:mm" in a tz to a UTC JS Date. */
export function zonedToUtc(dateISO: string, time: string, tz: string): Date {
  const [h, m] = time.split(":").map((x) => Number.parseInt(x, 10));
  const dt = DateTime.fromISO(dateISO, { zone: tz }).set({
    hour: h,
    minute: m,
    second: 0,
    millisecond: 0,
  });
  return dt.toUTC().toJSDate();
}

/** "HH:mm" label in patient tz for a UTC instant. */
export function utcToLocalTime(utc: Date, tz: string): string {
  return DateTime.fromJSDate(utc, { zone: "utc" }).setZone(tz).toFormat("HH:mm");
}

/** ISO date ("yyyy-MM-dd") in patient tz for a UTC instant. */
export function utcToLocalDate(utc: Date, tz: string): string {
  return DateTime.fromJSDate(utc, { zone: "utc" }).setZone(tz).toFormat("yyyy-MM-dd");
}

/** Today + N following calendar dates (ISO) in the given tz. */
export function localDateRange(tz: string, days: number): string[] {
  const start = DateTime.now().setZone(tz).startOf("day");
  return Array.from({ length: days }, (_, i) => start.plus({ days: i }).toFormat("yyyy-MM-dd"));
}

/** Start/end (UTC) of the local day offset by `dayOffset` (0 = today). */
export function localDayBoundsUtc(tz: string, dayOffset = 0): { startUtc: Date; endUtc: Date } {
  const day = DateTime.now().setZone(tz).startOf("day").plus({ days: dayOffset });
  return { startUtc: day.toUTC().toJSDate(), endUtc: day.endOf("day").toUTC().toJSDate() };
}

/**
 * Time-of-day slot label (Data-Flow §5 frozen rule):
 *   05:00–11:59 morning · 12:00–16:59 afternoon · 17:00–20:59 evening · else night
 */
export type SlotKey = "morning" | "afternoon" | "evening" | "night";

export function slotKeyForTime(time: string): SlotKey {
  const [h] = time.split(":").map((x) => Number.parseInt(x, 10));
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

const SLOT_LABELS: Record<CallLanguage, Record<SlotKey, string>> = {
  hi: { morning: "सुबह", afternoon: "दोपहर", evening: "शाम", night: "रात" },
  en: { morning: "morning", afternoon: "afternoon", evening: "evening", night: "night" },
  es: { morning: "mañana", afternoon: "tarde", evening: "noche", night: "noche" },
  bn: { morning: "সকালের", afternoon: "দুপুরের", evening: "সন্ধ্যার", night: "রাতের" },
  ur: { morning: "صبح", afternoon: "دوپہر", evening: "شام", night: "رات" },
  ta: { morning: "காலை", afternoon: "மதியம்", evening: "மாலை", night: "இரவு" },
  te: { morning: "ఉదయం", afternoon: "మధ్యాహ్నం", evening: "సాయంత్రం", night: "రాత్రి" },
  mr: { morning: "सकाळ", afternoon: "दुपार", evening: "संध्याकाळ", night: "रात्र" },
  gu: { morning: "સવાર", afternoon: "બપોર", evening: "સાંજ", night: "રાત" },
  pa: { morning: "ਸਵੇਰ", afternoon: "ਦੁਪਹਿਰ", evening: "ਸ਼ਾਮ", night: "ਰਾਤ" },
  ar: { morning: "الصباح", afternoon: "الظهيرة", evening: "المساء", night: "الليل" },
  fr: { morning: "matin", afternoon: "après-midi", evening: "soir", night: "nuit" },
  pt: { morning: "manhã", afternoon: "tarde", evening: "noite", night: "noite" },
  zh: { morning: "上午", afternoon: "下午", evening: "晚上", night: "夜间" },
  id: { morning: "pagi", afternoon: "siang", evening: "malam", night: "malam" },
  ms: { morning: "pagi", afternoon: "tengah hari", evening: "petang", night: "malam" },
  sw: { morning: "asubuhi", afternoon: "mchana", evening: "jioni", night: "usiku" },
  ha: { morning: "safe", afternoon: "rana", evening: "yamma", night: "dare" },
  yo: { morning: "òwúrọ̀", afternoon: "ọ̀sán", evening: "ìrọ̀lẹ́", night: "alẹ́" },
  af: { morning: "oggend", afternoon: "middag", evening: "aand", night: "nag" },
  am: { morning: "ጠዋት", afternoon: "ከሰዓት", evening: "ምሽት", night: "ሌሊት" },
  de: { morning: "Morgen", afternoon: "Nachmittag", evening: "Abend", night: "Nacht" },
  it: { morning: "mattina", afternoon: "pomeriggio", evening: "sera", night: "notte" },
  ja: { morning: "朝", afternoon: "昼", evening: "夕方", night: "夜" },
  ko: { morning: "아침", afternoon: "오후", evening: "저녁", night: "밤" },
  ru: { morning: "утро", afternoon: "день", evening: "вечер", night: "ночь" },
  tr: { morning: "sabah", afternoon: "öğleden sonra", evening: "akşam", night: "gece" },
  vi: { morning: "buổi sáng", afternoon: "buổi chiều", evening: "buổi tối", night: "ban đêm" },
  th: { morning: "เช้า", afternoon: "บ่าย", evening: "เย็น", night: "กลางคืน" },
  fa: { morning: "صبح", afternoon: "بعدازظهر", evening: "عصر", night: "شب" },
  nl: { morning: "ochtend", afternoon: "middag", evening: "avond", night: "nacht" },
  pl: { morning: "rano", afternoon: "popołudnie", evening: "wieczór", night: "noc" },
};

export function slotLabel(time: string, lang: CallLanguage): string {
  return SLOT_LABELS[lang][slotKeyForTime(time)];
}

/** Human 12-hour label, e.g. "8:00 AM" / "8:00 सुबह". */
export function pretty12h(time: string, lang: CallLanguage): string {
  const [h, m] = time.split(":").map((x) => Number.parseInt(x, 10));
  const dt = DateTime.fromObject({ hour: h, minute: m });
  const base = dt.toFormat("h:mm");
  if (lang === "hi") return `${base} ${slotLabel(time, "hi")}`;
  return dt.toFormat("h:mm a");
}

/** Expiry ("YYYY-MM") status vs now. */
export function expiryStatus(
  expiry: string | null | undefined,
  withinDays = 60,
): "expired" | "expiring" | "ok" | "unknown" {
  if (!expiry) return "unknown";
  const m = /^(\d{4})-(\d{2})$/.exec(expiry);
  if (!m) return "unknown";
  // Strips expire at the END of the printed month.
  const end = DateTime.fromObject({
    year: Number.parseInt(m[1], 10),
    month: Number.parseInt(m[2], 10),
  }).endOf("month");
  const now = DateTime.now();
  if (end < now) return "expired";
  if (end < now.plus({ days: withinDays })) return "expiring";
  return "ok";
}
