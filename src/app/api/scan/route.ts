import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { extractPhotos, resizeToDataUrl } from "@/lib/extraction";
import { buildDraftMedications } from "@/lib/normalize";
import { logger } from "@/lib/logger";
import { putPrivateAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MIME_ALIASES: Record<string, (typeof ALLOWED)[number]> = {
  "image/jpg": "image/jpeg",
  "image/x-png": "image/png",
};
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_BY_EXTENSION: Record<string, (typeof ALLOWED)[number]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** POST /api/scan — photos[] → DraftMedication[] (Arch §7.2 / Data-Flow §2). */
export const POST = withErrorBoundary(async (req: Request) => {
  const started = Date.now();
  const patient = await getPatientOrThrow();

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (files.length === 0) throw new AppError("VALIDATION", "Please attach at least one photo.");
  if (files.length > MAX_FILES)
    throw new AppError("VALIDATION", `Please use at most ${MAX_FILES} photos.`);
  const normalizedFiles = files.map((file) => ({ file, mimeType: imageMimeType(file) }));
  for (const { file, mimeType } of normalizedFiles) {
    if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "Each photo must be under 10 MB.");
    if (!mimeType) throw new AppError("VALIDATION", `Unsupported image type: ${file.type || "unknown"}`);
  }

  const batch = await prisma.scanBatch.create({
    data: { patientId: patient.id, status: "processing" },
  });

  // Persist originals + build bounded vision data URLs.
  const prepared: { dataUrl: string; photoNumber: number }[] = [];
  const preprocessingIssues: string[] = [];
  let idx = 0;
  for (const { file: f, mimeType } of normalizedFiles) {
    idx += 1;
    const buf = new Uint8Array(await f.arrayBuffer());
    const extension = EXTENSION_BY_MIME[mimeType!];
    const filename = `${idx}.${extension}`;
    const filePath = `photos/${batch.id}/${filename}`;
    await putPrivateAsset(filePath, buf, mimeType!);
    await prisma.scanPhoto.create({
      data: {
        batchId: batch.id,
        filePath,
        mimeType: mimeType!,
        sizeBytes: f.size,
      },
    });
    try {
      prepared.push({ dataUrl: await resizeToDataUrl(buf, mimeType!), photoNumber: idx });
    } catch (err) {
      // A damaged/unsupported image must not discard the useful photos from
      // the same upload. It is represented exactly like an isolated vision
      // failure so the review screen can explain what needs replacing.
      logger.warn({ photo: idx, err }, "photo resize failed");
      preprocessingIssues.push(`photo ${idx} could not be processed`);
    }
  }

  if (prepared.length === 0) {
    await prisma.scanBatch.update({ where: { id: batch.id }, data: { status: "failed" } });
    throw new AppError(
      "VALIDATION",
      "We couldn't read these image files. Please try another clear photo in daylight.",
    );
  }

  try {
    const { medications: rawMeds, imageIssues } = await extractPhotos(
      prepared.map((photo) => photo.dataUrl),
      prepared.map((photo) => photo.photoNumber),
    );
    const medications = await buildDraftMedications(rawMeds);

    await prisma.scanBatch.update({
      where: { id: batch.id },
      data: { status: "extracted", rawExtractionJson: JSON.stringify(rawMeds) },
    });

    logger.info(
      { route: "/api/scan", ms: Date.now() - started, photos: files.length, meds: medications.length },
      "scan complete",
    );
    return NextResponse.json({
      scanBatchId: batch.id,
      medications,
      imageIssues: [...preprocessingIssues, ...imageIssues],
    });
  } catch (err) {
    await prisma.scanBatch.update({ where: { id: batch.id }, data: { status: "failed" } });
    throw err;
  }
});

function imageMimeType(file: File): (typeof ALLOWED)[number] | null {
  if (ALLOWED.includes(file.type)) return file.type as (typeof ALLOWED)[number];
  if (MIME_ALIASES[file.type]) return MIME_ALIASES[file.type];
  if (file.type) return null;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension ? MIME_BY_EXTENSION[extension] ?? null : null;
}
