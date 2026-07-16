import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorBoundary } from "@/lib/errors";
import { ensureAudio } from "@/lib/tts";
import { voiceSampleScript } from "@/lib/voice-samples";
import { CALL_LANGUAGE_CODES } from "@/lib/languages";

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
  const audio = await ensureAudio(voiceSampleScript(language, name ?? ""), language, voiceGender);
  return NextResponse.json({ audioUrl: audio.url });
});
