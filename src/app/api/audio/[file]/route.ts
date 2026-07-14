import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withErrorBoundary, AppError } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ file: string }> };

/** GET /api/audio/:file — stream cached mp3 (Arch §7.7). Twilio fetches these. */
export const GET = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { file } = await ctx.params;
  if (!/^[a-f0-9]{64}\.mp3$/.test(file)) throw new AppError("NOT_FOUND", "Not found.");
  try {
    const buf = await readFile(join(process.cwd(), "storage", "audio", file));
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "public, max-age=86400",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    throw new AppError("NOT_FOUND", "Audio not found.");
  }
});
