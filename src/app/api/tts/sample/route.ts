import { NextResponse } from "next/server";
import { z } from "zod";
import { withErrorBoundary } from "@/lib/errors";
import { ensureAudio } from "@/lib/tts";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  language: z.enum(["en", "hi"]),
  voiceGender: z.enum(["female", "male"]),
  name: z.string().optional(),
});

const SAMPLE: Record<"en" | "hi", (n: string) => string> = {
  hi: (n) => `नमस्ते ${n || "जी"}। मैं दवाई साथी बोल रही हूँ। दवाई का समय हो गया है, कृपया अपनी दवाई ले लीजिए।`,
  en: (n) => `Hello ${n || "there"}, this is DawaiSaathi. It's time for your medicines, please take them now.`,
};

/** POST /api/tts/sample — onboarding "Preview voice" (02-DESIGN S0). */
export const POST = withErrorBoundary(async (req: Request) => {
  const { language, voiceGender, name } = bodySchema.parse(await req.json());
  const audio = await ensureAudio(SAMPLE[language](name ?? ""), language, voiceGender);
  return NextResponse.json({ audioUrl: audio.url });
});
