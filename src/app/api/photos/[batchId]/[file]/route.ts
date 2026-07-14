import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withErrorBoundary, AppError } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ batchId: string; file: string }> };

/** GET /api/photos/:batchId/:file — stream a stored strip photo (Arch §7.7). */
export const GET = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { batchId, file } = await ctx.params;
  // Traversal guards: cuid-ish batch id + "N.jpg" filename only.
  if (!/^[a-z0-9]+$/i.test(batchId) || !/^\d+\.jpg$/.test(file)) {
    throw new AppError("NOT_FOUND", "Not found.");
  }
  try {
    const buf = await readFile(join(process.cwd(), "storage", "photos", batchId, file));
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    throw new AppError("NOT_FOUND", "Photo not found.");
  }
});
