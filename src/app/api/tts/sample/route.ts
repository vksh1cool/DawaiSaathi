import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorBoundary } from "@/lib/errors";
import { ensureAudio } from "@/lib/tts";
import { voiceSampleScript } from "@/lib/voice-samples";
import { CALL_LANGUAGE_CODES } from "@/lib/languages";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  language: z.enum(CALL_LANGUAGE_CODES),
  voiceGender: z.enum(["female", "male"]),
  name: z.string().optional(),
});

/** POST /api/tts/sample — onboarding "Preview voice" (02-DESIGN S0). */
export const POST = withErrorBoundary(async (req: Request) => {
  const { language, voiceGender, name } = bodySchema.parse(await req.json());
  try {
    const audio = await ensureAudio(voiceSampleScript(language, name ?? ""), language, voiceGender);
    return NextResponse.json({ audioUrl: audio.url });
  } catch (err) {
    // Fail soft: the client falls back to the browser's on-device voice, so the
    // onboarding preview always speaks even when no TTS provider is reachable.
    logger.warn({ err, language }, "voice sample TTS unavailable — returning on-device fallback");
    return NextResponse.json({ audioUrl: null });
  }
});
