"use client";

/**
 * Client-side preparation of medicine-strip photos before upload.
 *
 * Phone cameras produce 3–15 MB JPEGs (12–50 MP). The scan route rejects
 * photos over 4 MB and cannot resize on the Worker (no native image
 * libraries), and the vision providers cap base64 image payloads too — so an
 * unprepared camera photo makes the whole scan fail. Downscaling here keeps
 * printed strip text legible while bringing each photo well under 1 MB, and
 * re-encoding through a canvas bakes in the EXIF orientation so the models
 * never receive a sideways strip.
 */

/** Long edge after downscaling; small strip text stays readable at this size. */
export const MAX_IMAGE_EDGE = 2048;
const JPEG_QUALITY = 0.85;
/** Must match MAX_BYTES in src/app/api/scan/route.ts. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const UPLOADABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const TYPE_ALIASES: Record<string, string> = { "image/jpg": "image/jpeg", "image/x-png": "image/png" };

export class PhotoPrepError extends Error {
  constructor(public reason: "unsupported" | "too_large") {
    super(reason);
  }
}

/** The server accepts these as-is (some mobile browsers leave File.type empty). */
export function isUploadableAsIs(file: File): boolean {
  const type = TYPE_ALIASES[file.type] ?? file.type;
  if (UPLOADABLE_TYPES.has(type)) return true;
  return type === "" && /\.(jpe?g|png|webp)$/i.test(file.name);
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older Safari rejects the options bag; fall through to <img>, which
      // applies EXIF orientation by default in every current browser.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas encoding failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, "") || "photo";
  return `${base}.jpg`;
}

/**
 * Returns an upload-ready JPEG for a camera or gallery photo. Formats the
 * browser can decode but the server does not accept (e.g. HEIC on Safari)
 * are converted too. Throws PhotoPrepError when the photo cannot be used.
 */
export async function prepareScanPhoto(file: File): Promise<File> {
  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    // Undecodable here, but an accepted type within the limit can still go
    // through unchanged — the server revalidates the file signature.
    if (isUploadableAsIs(file) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new PhotoPrepError(isUploadableAsIs(file) ? "too_large" : "unsupported");
  }

  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    // JPEG has no alpha: paint white so transparent PNG areas don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const blob = await canvasToJpeg(canvas);

    // A small, already-uploadable original can beat the re-encode on size;
    // keep it only when no downscaling was needed.
    if (scale === 1 && isUploadableAsIs(file) && file.size <= blob.size) return file;
    if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoPrepError("too_large");
    return new File([blob], jpegName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
  } catch (err) {
    if (err instanceof PhotoPrepError) throw err;
    if (isUploadableAsIs(file) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new PhotoPrepError("too_large");
  } finally {
    decoded.release();
  }
}
