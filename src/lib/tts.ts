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

// A generated clip plus its true media type (mp3 vs wav), so the delivery
// route can serve the right Content-Type for each provider.
type Clip = { data: Buffer; contentType: string };

// Injectable synth (tests skip network; pregen uses the real one).
// Receives the requested voice GENDER; the active provider maps it to a
// concrete voice, so one injected stub transparently covers every provider.
type Synth = (text: string, voiceGender: string) => Promise<Clip>;

type TtsProvider = "gemini" | "groq" | "huggingface" | "openai";

/** Preferred provider order, limited to whichever are actually configured. */
function ttsProviderChain(): TtsProvider[] {
  const chain: TtsProvider[] = [];
  // Gemini first: human-sounding and the only one that speaks Hindi + English
  // naturally from a single voice.
  if (config.geminiTtsEnabled) chain.push("gemini");
  if (config.groqTtsEnabled) chain.push("groq");
  if (config.huggingfaceEnabled) chain.push("huggingface");
  if (openAiTts) chain.push("openai");
  return chain;
}

function voiceForProvider(provider: TtsProvider, gender: string): string {
  const male = gender === "male";
  switch (provider) {
    case "gemini":
      return male ? config.geminiTtsVoiceMale : config.geminiTtsVoiceFemale;
    case "groq":
      return male ? config.groqTtsVoiceMale : config.groqTtsVoiceFemale;
    case "huggingface":
      return male ? config.huggingfaceTtsVoiceMale : config.huggingfaceTtsVoiceFemale;
    case "openai":
      return male ? config.openAiTtsVoiceMale : config.openAiTtsVoiceFemale;
  }
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
      // Nudge tone for elderly listeners; the model still speaks the text's language.
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

/** Groq PlayAI TTS — OpenAI-compatible endpoint, returns real mp3. */
async function groqTts(text: string, voice: string): Promise<Clip> {
  const res = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.groqApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.groqTtsModel, voice, input: text, response_format: "mp3" }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200) || res.statusText;
    throw new AppError("UPSTREAM_GROQ", `Groq TTS failed (${res.status}): ${detail}`);
  }
  return { data: Buffer.from(await res.arrayBuffer()), contentType: "audio/mpeg" };
}

/** Hugging Face Inference TTS — retries through the model cold-start (503). */
async function huggingfaceTts(text: string, voice: string): Promise<Clip> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${voice}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.huggingfaceApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });
    if (res.ok) return { data: Buffer.from(await res.arrayBuffer()), contentType: "audio/wav" };
    if (res.status === 503 && attempt < 2) {
      const info = (await res.json().catch(() => ({}))) as { estimated_time?: number };
      const waitMs = Math.ceil((info.estimated_time ?? 8) * 1000) + 1000;
      logger.info({ voice, waitMs }, "Hugging Face model loading; retrying");
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    const detail = (await res.text().catch(() => "")).slice(0, 200) || res.statusText;
    throw new AppError("UPSTREAM_HUGGINGFACE", `Hugging Face TTS failed (${res.status}): ${detail}`);
  }
  throw new AppError("UPSTREAM_HUGGINGFACE", "Hugging Face TTS failed: model still loading.");
}

/** OpenAI TTS — only reachable when an OpenAI key is configured. */
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
      "Generated call audio is unavailable because no TTS provider (Gemini, Groq, Hugging Face, or OpenAI) is configured.",
    );
  }
  const errors: string[] = [];
  for (const provider of chain) {
    try {
      const voice = voiceForProvider(provider, gender);
      if (provider === "gemini") return await geminiTts(text, voice);
      if (provider === "groq") return await groqTts(text, voice);
      if (provider === "huggingface") return await huggingfaceTts(text, voice);
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

/** Ensure an mp3 exists for this script text; return its content-addressed ref. */
export async function ensureAudio(
  scriptText: string,
  language: CallLanguage,
  voiceGender: string,
): Promise<AudioRef> {
  // The active provider (Groq / Hugging Face / OpenAI) is part of the cache key
  // so switching providers regenerates rather than serving a stale voice.
  const provider = ttsProviderChain()[0] ?? "none";
  const hash = sha256(`${language}|${provider}|${voiceGender}|${scriptText}`);
  const rel = `audio/${hash}.mp3`;
  const url = `/api/audio/${hash}.mp3`;

  const existing = await prisma.audioAsset.findUnique({ where: { hash } });
  if (existing && (await hasPrivateAsset(existing.filePath))) {
    return { hash, filePath: rel, url, scriptText };
  }

  const clip = await synth(scriptText, voiceGender);
  await putPrivateAsset(rel, clip.data, clip.contentType);
  await prisma.audioAsset.upsert({
    where: { hash },
    create: { hash, language, scriptText, filePath: rel },
    update: { filePath: rel, scriptText },
  });
  logger.info({ hash, bytes: clip.data.length, language, contentType: clip.contentType }, "tts generated");
  return { hash, filePath: rel, url, scriptText };
}
