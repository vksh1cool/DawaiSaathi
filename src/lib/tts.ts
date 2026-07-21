import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { openAiTts } from "@/lib/openai";
import { reserveOpenAiRequest } from "@/lib/openai-budget";
import { logger } from "@/lib/logger";
import { sha256 } from "@/lib/util/hash";
import { AppError } from "@/lib/errors";
import type { CallLanguage } from "@/lib/languages";
import { hasPrivateAsset, putPrivateAsset } from "@/lib/storage";

/** Script → cached audio clip (Arch §11). Content-addressed by voice profile. */

// Directorial style prompt. Gemini and OpenAI both read the *content* only and
// use this as delivery direction (it is never spoken). Written to evoke a
// genuinely human, tender, unhurried voice — the emotion lives here, so the
// spoken scripts can stay factual and safe.
export const TTS_INSTRUCTIONS =
  "Read the following aloud like a warm, loving daughter gently reminding her elderly mother to take her medicine. " +
  "Speak slowly, softly and very clearly, with real tenderness, patience and a caring smile in your voice — " +
  "never robotic, flat or rushed. Pause naturally between each medicine, and pronounce every medicine name slowly, " +
  "syllable by syllable, so it is easy for an older person to hear and follow.";

// Bump when the voice, model, or style prompt changes so the content-addressed
// cache regenerates instead of serving audio in the previous voice.
const VOICE_PROFILE_VERSION = "v2-gemini-warm";

// A generated clip plus its true media type (mp3 vs wav), so the delivery
// route can serve the right Content-Type for each provider.
type Clip = { data: Buffer; contentType: string };

// Injectable synth (tests skip network; pregen uses the real one).
// Receives the requested voice GENDER; the active provider maps it to a
// concrete voice, so one injected stub transparently covers every provider.
type Synth = (text: string, voiceGender: string) => Promise<Clip>;

// One great free voice engine (Gemini native TTS — human, multilingual) with an
// optional paid OpenAI last resort. When both are unavailable, callers such as
// /api/tts/preview degrade to the browser's on-device voice, so a preview always
// speaks even with zero server-side providers.
type TtsProvider = "gemini" | "openai";

/** Preferred provider order, limited to whichever are actually configured. */
function ttsProviderChain(): TtsProvider[] {
  const chain: TtsProvider[] = [];
  // Gemini first: human-sounding, free, and the only one that speaks Hindi +
  // English naturally from a single voice.
  if (config.geminiTtsEnabled) chain.push("gemini");
  if (openAiTts) chain.push("openai");
  return chain;
}

function voiceForProvider(provider: TtsProvider, gender: string): string {
  const male = gender === "male";
  switch (provider) {
    case "gemini":
      return male ? config.geminiTtsVoiceMale : config.geminiTtsVoiceFemale;
    case "openai":
      return male ? config.openAiTtsVoiceMale : config.openAiTtsVoiceFemale;
  }
}

function modelForProvider(provider: TtsProvider): string {
  return provider === "gemini" ? config.geminiTtsModel : config.ttsModel;
}

/** Wrap raw signed-16-bit-LE mono PCM in a minimal WAV container. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

type GeminiTtsResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
  }>;
};

/** Gemini native TTS — returns PCM audio we wrap as WAV. Human + multilingual. */
async function geminiTts(text: string, voice: string): Promise<Clip> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiTtsModel}:generateContent` +
    `?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Directorial style prompt shapes delivery; the model speaks only the
      // text and in whatever language the text is written in.
      contents: [{ parts: [{ text: `${TTS_INSTRUCTIONS}\n\n${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200) || res.statusText;
    throw new AppError("UPSTREAM_GEMINI", `Gemini TTS failed (${res.status}): ${detail}`);
  }
  const body = (await res.json()) as GeminiTtsResponse;
  const inline = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new AppError("UPSTREAM_GEMINI", "Gemini TTS returned no audio.");
  const rateMatch = /rate=(\d+)/.exec(inline.mimeType ?? "");
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  return { data: pcmToWav(Buffer.from(inline.data, "base64"), sampleRate), contentType: "audio/wav" };
}

/** OpenAI TTS — optional paid last resort, only reachable when a key is set. */
async function openaiTts(text: string, voice: string): Promise<Clip> {
  await reserveOpenAiRequest("tts");
  const res = await openAiTts!.audio.speech.create({
    model: config.ttsModel,
    voice,
    input: text,
    instructions: TTS_INSTRUCTIONS,
    response_format: "mp3",
  });
  return { data: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

const realSynth: Synth = async (text, gender) => {
  // This runs only after the content-addressed cache misses, so cached demo
  // clips stay free and do not consume any daily cap.
  const chain = ttsProviderChain();
  if (chain.length === 0) {
    throw new AppError(
      "TTS_UNAVAILABLE",
      "Generated call audio is unavailable because no TTS provider (Gemini or OpenAI) is configured.",
    );
  }
  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const voice = voiceForProvider(provider, gender);
      if (provider === "gemini") return await geminiTts(text, voice);
      return await openaiTts(text, voice);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${provider}: ${message}`);
      logger.warn({ provider, error: message }, "TTS provider failed; trying next");
    }
  }
  throw new AppError("TTS_UNAVAILABLE", `All TTS providers failed — ${errors.join("; ")}`);
};
let synth: Synth = realSynth;
export function _setTtsSynth(s: Synth) {
  synth = s;
}
export function _resetTtsSynth() {
  synth = realSynth;
}

export type AudioRef = { hash: string; filePath: string; url: string; scriptText: string };

/** Ensure an audio clip exists for this script text; return its cache ref. */
export async function ensureAudio(
  scriptText: string,
  language: CallLanguage,
  voiceGender: string,
): Promise<AudioRef> {
  const text = scriptText.trim();
  if (!text) {
    throw new AppError("VALIDATION", "There is nothing to say — the reminder text is empty.");
  }
  // The full voice profile (provider + model + concrete voice + style version)
  // is part of the cache key, so changing any of them regenerates the clip
  // instead of serving audio in the previous voice.
  const chain = ttsProviderChain();
  const provider = chain.length > 0 ? chain[0] : null;
  const voice = provider ? voiceForProvider(provider, voiceGender) : "";
  const model = provider ? modelForProvider(provider) : "";
  const hash = sha256(
    `${VOICE_PROFILE_VERSION}|${language}|${provider ?? "none"}|${model}|${voice}|${voiceGender}|${text}`,
  );
  const rel = `audio/${hash}.mp3`;
  const url = `/api/audio/${hash}.mp3`;

  const existing = await prisma.audioAsset.findUnique({ where: { hash } });
  if (existing && (await hasPrivateAsset(existing.filePath))) {
    return { hash, filePath: rel, url, scriptText: text };
  }

  const clip = await synth(text, voiceGender);
  await putPrivateAsset(rel, clip.data, clip.contentType);
  await prisma.audioAsset.upsert({
    where: { hash },
    create: { hash, language, scriptText: text, filePath: rel },
    update: { filePath: rel, scriptText: text },
  });
  logger.info({ hash, bytes: clip.data.length, language, contentType: clip.contentType }, "tts generated");
  return { hash, filePath: rel, url, scriptText: text };
}
