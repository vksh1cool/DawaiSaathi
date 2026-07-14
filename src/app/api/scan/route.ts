import { NextResponse } from "next/server";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { AppError, withErrorBoundary } from "@/lib/errors";
import { getPatientOrThrow } from "@/lib/household";
import { extractPhotos, resizeToDataUrl } from "@/lib/extraction";
import { buildDraftMedications } from "@/lib/normalize";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** POST /api/scan — photos[] → DraftMedication[] (Arch §7.2 / Data-Flow §2). */
export const POST = withErrorBoundary(async (req: Request) => {
  const started = Date.now();
  const patient = await getPatientOrThrow();

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);

  if (files.length === 0) throw new AppError("VALIDATION", "Please attach at least one photo.");
  if (files.length > MAX_FILES)
    throw new AppError("VALIDATION", `Please use at most ${MAX_FILES} photos.`);
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new AppError("VALIDATION", "Each photo must be under 10 MB.");
    if (f.type && !ALLOWED.includes(f.type))
      throw new AppError("VALIDATION", `Unsupported image type: ${f.type}`);
  }

  const batch = await prisma.scanBatch.create({
    data: { patientId: patient.id, status: "processing" },
  });

  // Persist originals + build resized data URLs.
  const dir = join(process.cwd(), "storage", "photos", batch.id);
  await mkdir(dir, { recursive: true });
  const dataUrls: string[] = [];
  let idx = 0;
  for (const f of files) {
    idx += 1;
    const buf = Buffer.from(await f.arrayBuffer());
    const filePath = join(dir, `${idx}.jpg`);
    await writeFile(filePath, buf);
    await prisma.scanPhoto.create({
      data: {
        batchId: batch.id,
        filePath: `storage/photos/${batch.id}/${idx}.jpg`,
        mimeType: f.type || "image/jpeg",
        sizeBytes: f.size,
      },
    });
    dataUrls.push(await resizeToDataUrl(buf));
  }

  try {
    const { medications: rawMeds, imageIssues } = await extractPhotos(dataUrls);
    const medications = await buildDraftMedications(rawMeds);

    await prisma.scanBatch.update({
      where: { id: batch.id },
      data: { status: "extracted", rawExtractionJson: JSON.stringify(rawMeds) },
    });

    logger.info(
      { route: "/api/scan", ms: Date.now() - started, photos: files.length, meds: medications.length },
      "scan complete",
    );
    return NextResponse.json({ scanBatchId: batch.id, medications, imageIssues });
  } catch (err) {
    await prisma.scanBatch.update({ where: { id: batch.id }, data: { status: "failed" } });
    throw err;
  }
});
