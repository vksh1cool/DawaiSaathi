import { prisma } from "@/lib/db";
import { withErrorBoundary, AppError } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { getPrivateAsset } from "@/lib/storage";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ batchId: string; file: string }> };

/** GET /api/photos/:batchId/:file — stream a stored strip photo (Arch §7.7). */
export const GET = withErrorBoundary(async (_req: Request, ctx: Ctx) => {
  const { batchId, file } = await ctx.params;
  // Traversal guards: cuid-ish batch id + an indexed image filename only.
  if (!/^[a-z0-9]+$/i.test(batchId) || !/^\d+\.(jpg|jpeg|png|webp|heic|heif)$/i.test(file)) {
    throw new AppError("NOT_FOUND", "Not found.");
  }
  const patient = await getPatientOrThrow();
  try {
    const photo = await prisma.scanPhoto.findFirst({
      where: {
        batchId,
        filePath: { in: [`photos/${batchId}/${file}`, `storage/photos/${batchId}/${file}`] },
        batch: { patientId: patient.id },
      },
      select: { mimeType: true, filePath: true },
    });
    if (!photo) throw new AppError("NOT_FOUND", "Photo not found.");
    const asset = await getPrivateAsset(photo.filePath);
    if (!asset) throw new AppError("NOT_FOUND", "Photo not found.");
    return new Response(asset.body, {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Length": String(asset.size),
        // Prescription images are sensitive and should not remain in a shared
        // machine's browser cache after a caregiver signs out.
        "Cache-Control": "private, no-store",
        ...(asset.etag ? { ETag: asset.etag } : {}),
      },
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("NOT_FOUND", "Photo not found.");
  }
});
