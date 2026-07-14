import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { openai } from "@/lib/openai";
import { logger } from "@/lib/logger";
import { sha256 } from "@/lib/util/hash";
import type { Language } from "@/types/domain";

/** Script → cached mp3 (Arch §11). Content-addressed by (lang|voice|text). */

export const TTS_INSTRUCTIONS =
  "Speak in a warm, clear, slow pace, like a caring family member speaking to an elderly parent. Pause briefly after each medicine name. Pronounce medicine brand names clearly, syllable by syllable.";

const AUDIO_DIR = join(process.cwd(), "storage", "audio");

// Injectable synth (tests skip network; pregen uses the real one).
type Synth = (text: string, voice: string) => Promise<Buffer>;
const realSynth: Synth = async (text, voice) => {
  const res = await openai.audio.speech.create({
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export type AudioRef = { hash: string; filePath: string; url: string; scriptText: string };

/** Ensure an mp3 exists for this script text; return its content-addressed ref. */
export async function ensureAudio(
  scriptText: string,
  language: Language,
  voiceGender: string,
): Promise<AudioRef> {
  const voice = voiceFor(voiceGender);
  const hash = sha256(`${language}|${voice}|${scriptText}`);
  const rel = `storage/audio/${hash}.mp3`;
  const abs = join(AUDIO_DIR, `${hash}.mp3`);
  const url = `/api/audio/${hash}.mp3`;

  const existing = await prisma.audioAsset.findUnique({ where: { hash } });
  if (existing && (await fileExists(abs))) {
    return { hash, filePath: rel, url, scriptText };
  }

  const buf = await synth(scriptText, voice);
  await mkdir(AUDIO_DIR, { recursive: true });
  await writeFile(abs, buf);
  await prisma.audioAsset.upsert({
    where: { hash },
    create: { hash, language, scriptText, filePath: rel },
    update: { filePath: rel, scriptText },
  });
  logger.info({ hash, bytes: buf.length, language }, "tts generated");
  return { hash, filePath: rel, url, scriptText };
}
