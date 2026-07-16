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

export const TTS_INSTRUCTIONS =
  "Speak in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Pause briefly after each medicine name. Pronounce medicine brand names clearly, syllable by syllable.";

// Injectable synth (tests skip network; pregen uses the real one).
type Synth = (text: string, voice: string) => Promise<Buffer>;
const realSynth: Synth = async (text, voice) => {
  // This runs only after the content-addressed cache misses, so cached demo
  // clips stay free and do not consume the daily cap.
  if (!openAiTts) {
    throw new AppError(
      "UPSTREAM_OPENAI",
      "Generated call audio is unavailable because OPENAI_API_KEY is not configured for text-to-speech.",
    );
  }
  await reserveOpenAiRequest("tts");
  const res = await openAiTts.audio.speech.create({
    model: config.ttsModel,
    voice,
    input: text,
    instructions: TTS_INSTRUCTIONS,
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

const voiceFor = (gender: string) =>
  gender === "male" ? config.ttsVoiceMale : config.ttsVoiceFemale;

export type AudioRef = { hash: string; filePath: string; url: string; scriptText: string };

/** Ensure an mp3 exists for this script text; return its content-addressed ref. */
export async function ensureAudio(
  scriptText: string,
  language: CallLanguage,
  voiceGender: string,
): Promise<AudioRef> {
  const voice = voiceFor(voiceGender);
  const hash = sha256(`${language}|${voice}|${scriptText}`);
  const rel = `audio/${hash}.mp3`;
  const url = `/api/audio/${hash}.mp3`;

  const existing = await prisma.audioAsset.findUnique({ where: { hash } });
  if (existing && (await hasPrivateAsset(existing.filePath))) {
    return { hash, filePath: rel, url, scriptText };
  }

  const buf = await synth(scriptText, voice);
  await putPrivateAsset(rel, buf, "audio/mpeg");
  await prisma.audioAsset.upsert({
    where: { hash },
    create: { hash, language, scriptText, filePath: rel },
    update: { filePath: rel, scriptText },
  });
  logger.info({ hash, bytes: buf.length, language }, "tts generated");
  return { hash, filePath: rel, url, scriptText };
}
