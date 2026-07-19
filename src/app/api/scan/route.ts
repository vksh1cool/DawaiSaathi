import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { extractPhotos, resizeToDataUrl } from "@/lib/extraction";
import { buildDraftMedications } from "@/lib/normalize";
import { logger } from "@/lib/logger";
import { putPrivateAsset } from "@/lib/storage";
import { usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { createSupabaseScanBatch, createSupabaseScanPhoto, updateSupabaseScanBatch } from "@/lib/supabase/scan";


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

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (files.length === 0) throw new AppError("VALIDATION", "Please attach at least one photo.");
  if (files.length > MAX_FILES)
    throw new AppError("VALIDATION", `Please use at most ${MAX_FILES} photos.`);
  const normalizedFiles = files.map((file) => ({ file, mimeType: imageMimeType(file) }));
  for (const { file, mimeType } of normalizedFiles) {
    if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "Each photo must be under 4 MB.");
    if (!mimeType) throw new AppError("VALIDATION", `Unsupported image type: ${file.type || "unknown"}`);
  }

  // Validate the actual file signatures before creating database or object
  // records. MIME types and filename extensions are client-provided metadata.
  const uploadFiles = await Promise.all(
    normalizedFiles.map(async ({ file, mimeType }, index) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!hasExpectedImageSignature(bytes, mimeType!)) {
        throw new AppError("VALIDATION", `Photo ${index + 1} does not match its declared image format.`);
      }
      return { file, mimeType: mimeType!, bytes };
    }),
  );

  const isSupa = usesSupabaseAuth();
  let batchId: string;
  if (isSupa) {
    const supabaseBatch = await createSupabaseScanBatch();
    batchId = supabaseBatch.id;
  } else {
    const patient = await getPatientOrThrow();
    const batch = await prisma.scanBatch.create({
      data: { patientId: patient.id, status: "processing" },
    });
    batchId = batch.id;
  }

  // Persist originals + build bounded vision data URLs.
  const prepared: { dataUrl: string; photoNumber: number }[] = [];
  const preprocessingIssues: string[] = [];
  let idx = 0;
  for (const { file: f, mimeType, bytes: buf } of uploadFiles) {
    idx += 1;
    const extension = EXTENSION_BY_MIME[mimeType];
    const filename = `${idx}.${extension}`;
    const filePath = `photos/${batchId}/${filename}`;
    await putPrivateAsset(filePath, buf, mimeType);
    if (isSupa) {
      await createSupabaseScanPhoto(batchId, filePath, mimeType, f.size);
    } else {
      await prisma.scanPhoto.create({
        data: {
          batchId: batchId,
          filePath,
          mimeType,
          sizeBytes: f.size,
        },
      });
    }
    try {
      prepared.push({ dataUrl: await resizeToDataUrl(buf, mimeType), photoNumber: idx });
    } catch (err) {
      // A damaged/unsupported image must not discard the useful photos from
      // the same upload. It is represented exactly like an isolated vision
      // failure so the review screen can explain what needs replacing.
      logger.warn({ photo: idx, err }, "photo resize failed");
      preprocessingIssues.push(`photo ${idx} could not be processed`);
    }
  }

  if (prepared.length === 0) {
    if (isSupa) {
      await updateSupabaseScanBatch(batchId, { status: "failed" });
    } else {
      await prisma.scanBatch.update({ where: { id: batchId }, data: { status: "failed" } });
    }
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

    if (isSupa) {
      await updateSupabaseScanBatch(batchId, { status: "extracted", rawExtractionJson: JSON.stringify(rawMeds) });
    } else {
      await prisma.scanBatch.update({
        where: { id: batchId },
        data: { status: "extracted", rawExtractionJson: JSON.stringify(rawMeds) },
      });
    }

    logger.info(
      { route: "/api/scan", ms: Date.now() - started, photos: files.length, meds: medications.length },
      "scan complete",
    );
    return NextResponse.json({
      scanBatchId: batchId,
      medications,
      imageIssues: [...preprocessingIssues, ...imageIssues],
    });
  } catch (err) {
    if (isSupa) {
      await updateSupabaseScanBatch(batchId, { status: "failed" });
    } else {
      await prisma.scanBatch.update({ where: { id: batchId }, data: { status: "failed" } });
    }
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

/** Reject a renamed non-image before it reaches storage or the vision provider. */
function hasExpectedImageSignature(bytes: Uint8Array, mimeType: (typeof ALLOWED)[number]): boolean {
  if (mimeType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
  }
  // WebP is a RIFF container with a WEBP signature at bytes 8–11.
  return bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
