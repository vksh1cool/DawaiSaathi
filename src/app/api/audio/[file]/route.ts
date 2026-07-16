import { withErrorBoundary, AppError } from "@/lib/errors";
import { getPrivateAsset } from "@/lib/storage";
import {
  accessGateEnabled,
  hasValidAccessSession,
  hasValidAudioAccessToken,
} from "@/lib/access-gate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ file: string }> };

/** GET /api/audio/:file — stream cached mp3 (Arch §7.7). Twilio fetches these. */
export const GET = withErrorBoundary(async (req: Request, ctx: Ctx) => {
  const { file } = await ctx.params;
  if (!/^[a-f0-9]{64}\.mp3$/.test(file)) throw new AppError("NOT_FOUND", "Not found.");
  if (accessGateEnabled()) {
    const token = new URL(req.url).searchParams.get("token");
    const allowed =
      (await hasValidAccessSession(req.headers.get("cookie"))) ||
      (await hasValidAudioAccessToken(file, token));
    if (!allowed) throw new AppError("UNAUTHORIZED", "Private access is required.");
  }
  const asset = await getPrivateAsset(`audio/${file}`);
  if (!asset) throw new AppError("NOT_FOUND", "Audio not found.");
  return new Response(asset.body, {
    headers: {
      "Content-Type": asset.contentType ?? "audio/mpeg",
      "Content-Length": String(asset.size),
      // The file name is opaque, but the spoken content can include a medicine
      // name. R2 is the content-addressed generation cache; never turn the
      // bearer-protected delivery URL into a shared CDN cache entry.
      "Cache-Control": "private, no-store",
      ...(asset.etag ? { ETag: asset.etag } : {}),
    },
  });
});
