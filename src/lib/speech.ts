"use client";

/**
 * Browser SpeechSynthesis is the fallback voice used whenever generated
 * (OpenAI) call audio is unavailable — no OPENAI_API_KEY, a temporary upstream
 * error, or a cache miss the daily cap will not fund. Left to its defaults that
 * fallback only sets `utterance.lang`, so every caregiver hears the operating
 * system's single default voice for the locale and the female/male choice is
 * inaudible. This module makes the fallback honour that choice by:
 *   1. selecting a locale-matching voice whose name reveals the requested
 *      gender, when the platform ships one; and
 *   2. always nudging `utterance.pitch` so the two options stay audibly
 *      distinct even when a locale exposes a single, un-gendered voice (common
 *      for Indian-language voices such as "Google हिन्दी").
 */

export type SpeechGender = "female" | "male";

/** Voice-name fragments that reveal gender across the engines shipped by
 *  macOS/iOS (Safari), Windows/Edge, and Android/Chrome. Lowercased, matched as
 *  substrings against SpeechSynthesisVoice.name. Not exhaustive — an unmatched
 *  name still gets the pitch cue below, so the genders never collapse. */
const FEMALE_VOICE_HINTS = [
  "female", "woman",
  "samantha", "victoria", "karen", "moira", "tessa", "fiona", "kate", "serena",
  "susan", "linda", "zira", "hazel", "catherine", "allison", "ava", "susanna",
  "heera", "kalpana", "swara", "veena", "raveena", "aditi", "ananya", "lekha",
  "sangeeta", "pooja", "neerja", "shruti",
];
const MALE_VOICE_HINTS = [
  "male", "man",
  "daniel", "alex", "fred", "thomas", "oliver", "arthur", "gordon", "aaron",
  "david", "mark", "george", "james", "guy", "rishi", "ravi", "hemant",
  "prabhat", "madhur", "kunal",
];

/** Best-effort gender inference from a voice name; null when the name is
 *  gender-neutral (e.g. "Google US English"). "female" is tested first because
 *  the string "female" contains "male". */
function voiceGenderOf(name: string): SpeechGender | null {
  const n = name.toLowerCase();
  if (FEMALE_VOICE_HINTS.some((hint) => n.includes(hint))) return "female";
  if (MALE_VOICE_HINTS.some((hint) => n.includes(hint))) return "male";
  return null;
}

/** 2 = exact locale (hi-IN === hi-IN), 1 = same language (hi === hi-*), 0 = no
 *  match. Normalises `_`/`-` and case so "hi_IN" and "hi-IN" compare equal. */
function localeScore(voiceLang: string, locale: string): number {
  const v = voiceLang.toLowerCase().replace(/_/g, "-");
  const l = locale.toLowerCase().replace(/_/g, "-");
  if (v === l) return 2;
  if (v.split("-")[0] === l.split("-")[0]) return 1;
  return 0;
}

/** Pick the best locale-matching voice, preferring one whose name matches the
 *  requested gender. Returns null when no voice matches the locale at all (the
 *  caller then relies on the pitch cue with the platform default voice). */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  locale: string,
  gender: SpeechGender,
): SpeechSynthesisVoice | null {
  const candidates = voices
    .map((voice) => ({ voice, score: localeScore(voice.lang, locale) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) return null;

  const genderMatch = candidates.find(
    (candidate) => voiceGenderOf(candidate.voice.name) === gender,
  );
  return (genderMatch ?? candidates[0]).voice;
}

/** Configure an utterance to sound like `gender`. Sets a gender-matched voice
 *  when the platform has one and always adjusts pitch: a gentle nudge reinforces
 *  a matched voice, while a stronger shift is the sole cue when only an
 *  un-gendered voice exists so female and male never sound identical. */
export function applyGenderedVoice(
  utterance: SpeechSynthesisUtterance,
  locale: string,
  gender: SpeechGender,
  voices: SpeechSynthesisVoice[],
): void {
  const picked = pickVoice(voices, locale, gender);
  const matchedGender = picked ? voiceGenderOf(picked.name) === gender : false;
  if (picked) utterance.voice = picked;
  // Pitch range is 0–2 (default 1). Values chosen to stay natural yet clearly
  // separate the two options in every browser.
  if (gender === "female") utterance.pitch = matchedGender ? 1.1 : 1.35;
  else utterance.pitch = matchedGender ? 0.85 : 0.6;
}

let voicesCache: SpeechSynthesisVoice[] = [];
let listeningForVoices = false;

function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** The platform's synthesis voices. Many engines populate this list lazily and
 *  fire `voiceschanged` once ready, so we cache and refresh on that event. Safe
 *  to call during SSR (returns an empty list). */
export function getSpeechVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return [];
  if (!listeningForVoices) {
    listeningForVoices = true;
    const refresh = () => {
      voicesCache = window.speechSynthesis.getVoices();
    };
    refresh();
    window.speechSynthesis.addEventListener("voiceschanged", refresh);
  } else if (voicesCache.length === 0) {
    voicesCache = window.speechSynthesis.getVoices();
  }
  return voicesCache;
}
