import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { openAiTts } from "@/lib/openai";
import { reserveOpenAiRequest } from "@/lib/openai-budget";
import { logger } from "@/lib/logger";
import { sha256 } from "@/lib/util/hash";
import { AppError } from "@/lib/errors";
import type { CallLanguage } from "@/lib/languages";
import { hasPrivateAsset, putPrivateAsset } from "@/lib/storage";

/** Script → cached mp3 (Arch §11). Content-addressed by (lang|voice|text). */

/** Per-language TTS instructions — OpenAI voices render South Asian languages more
 *  naturally with script-specific pronunciation guidance. Default works for English. */
const TTS_INSTRUCTIONS_BY_LANG: Record<string, string> = {
  hi: "Speak Hindi in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Pronounce Devanagari words naturally with proper Hindi inflection. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  bn: "Speak Bengali in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Bengali intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  ta: "Speak Tamil in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Tamil intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  te: "Speak Telugu in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Telugu intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  mr: "Speak Marathi in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Pronounce Marathi words with proper inflection. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  gu: "Speak Gujarati in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Gujarati intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  pa: "Speak Punjabi in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Punjabi intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
  ur: "Speak Urdu in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Use natural Urdu intonation. Pause briefly after each medicine name. Read medicine brand names syllable by syllable.",
};

const DEFAULT_TTS_INSTRUCTIONS =
  "Speak in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Pause briefly after each medicine name. Pronounce medicine brand names clearly, syllable by syllable.";

/** Per-language recommended voice — Indian languages use voices that render
 *  South Asian phonetics more naturally. Falls back to the env-configured defaults. */
const LANGUAGE_VOICE_FEMALE: Record<string, string> = {
  hi: "nova", bn: "nova", ta: "sage", te: "sage",
  mr: "nova", gu: "sage", pa: "nova", ur: "nova",
};
const LANGUAGE_VOICE_MALE: Record<string, string> = {
  hi: "ash", bn: "ash", ta: "onyx", te: "onyx",
  mr: "ash", gu: "onyx", pa: "ash", ur: "ash",
};

// Injectable synth (tests skip network; pregen uses the real one).
type Synth = (text: string, voice: string, language: string) => Promise<Buffer>;
const realSynth: Synth = async (text, voice, language) => {
  // This runs only after the content-addressed cache misses, so cached demo
  // clips stay free and do not consume the daily cap.
  if (!openAiTts) {
    throw new AppError(
      "UPSTREAM_OPENAI",
      "Generated call audio is unavailable because OPENAI_API_KEY is not configured for text-to-speech.",
    );
  }
  await reserveOpenAiRequest("tts");
  const instructions = TTS_INSTRUCTIONS_BY_LANG[language] ?? DEFAULT_TTS_INSTRUCTIONS;
  const res = await openAiTts.audio.speech.create({
    model: config.ttsModel,
    voice,
    input: text,
    instructions,
    response_format: "mp3",
  });
  return Buffer.from(await res.arrayBuffer());
};
let synth: Synth = realSynth;
export function _setTtsSynth(s: Synth) {
  synth = s;
}
export function _resetTtsSynth() {
  synth = realSynth;
}

const voiceFor = (gender: string, language: string) =>
  gender === "male"
    ? LANGUAGE_VOICE_MALE[language] ?? config.ttsVoiceMale
    : LANGUAGE_VOICE_FEMALE[language] ?? config.ttsVoiceFemale;

export type AudioRef = { hash: string; filePath: string; url: string; scriptText: string };

/** Ensure an mp3 exists for this script text; return its content-addressed ref. */
export async function ensureAudio(
  scriptText: string,
  language: CallLanguage,
  voiceGender: string,
): Promise<AudioRef> {
  const voice = voiceFor(voiceGender, language);
  const hash = sha256(`${language}|${voice}|${scriptText}`);
  const rel = `audio/${hash}.mp3`;
  const url = `/api/audio/${hash}.mp3`;

  const existing = await prisma.audioAsset.findUnique({ where: { hash } });
  if (existing && (await hasPrivateAsset(existing.filePath))) {
    return { hash, filePath: rel, url, scriptText };
  }

  const buf = await synth(scriptText, voice, language);
  await putPrivateAsset(rel, buf, "audio/mpeg");
  await prisma.audioAsset.upsert({
    where: { hash },
    create: { hash, language, scriptText, filePath: rel },
    update: { filePath: rel, scriptText },
  });
  logger.info({ hash, bytes: buf.length, language }, "tts generated");
  return { hash, filePath: rel, url, scriptText };
}
