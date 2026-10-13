"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";
import { PhotoPrepError, prepareScanPhoto } from "@/lib/image-prep";

/** Original-file identity of each prepared upload, for duplicate detection. */
const sourceKeyOf = new WeakMap<File, string>();

export function PhotoDropzone({
  files,
  onChange,
  onPreparingChange,
  max = 5,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** True while selected photos are still being resized for upload. */
  onPreparingChange?: (preparing: boolean) => void;
  max?: number;
}) {
  const { t } = useI18n();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  // `capture` opens the camera directly on phones; on a desktop it is
  // ignored, so only offer the separate camera button on touch devices.
  const [hasCamera, setHasCamera] = useState(false);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  useEffect(() => {
    setHasCamera(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  useEffect(() => {
    onPreparingChange?.(preparing > 0);
  }, [preparing, onPreparingChange]);

  const add = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const existing = new Set(filesRef.current.map((file) => sourceKeyOf.get(file) ?? fileKey(file)));
    const incoming = Array.from(list).filter((file) => file.type === "" || file.type.startsWith("image/"));
    const unique = incoming.filter((file) => {
      const key = fileKey(file);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    const available = Math.max(0, max - filesRef.current.length);
    const accepted = unique.slice(0, available);

    let note: string | null = null;
    if (incoming.length !== list.length) note = t("scan.unsupportedImage");
    else if (unique.length !== incoming.length) note = t("scan.duplicateImage");
    else if (unique.length > available) note = t("scan.photoLimit", { max });
    setMessage(note);
    if (accepted.length === 0) return;

    setPreparing((n) => n + accepted.length);
    const results = await Promise.allSettled(accepted.map((file) => prepareScanPhoto(file)));
    setPreparing((n) => n - accepted.length);

    const ready: File[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        sourceKeyOf.set(result.value, fileKey(accepted[index]));
        ready.push(result.value);
      } else {
        const reason = result.reason instanceof PhotoPrepError ? result.reason.reason : "unsupported";
        setMessage(t(reason === "too_large" ? "scan.photoTooLarge" : "scan.unsupportedImage"));
      }
    });
    if (ready.length > 0) {
      onChange([...filesRef.current, ...ready].slice(0, max));
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    void add(event.dataTransfer.files);
  };

  const busy = preparing > 0;
  const canAdd = files.length + preparing < max;

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
    >
      {files.length === 0 && !busy ? (
        <div
          className={`flex min-h-[200px] w-full flex-col items-center justify-center gap-4 rounded-[16px] border-2 border-dashed bg-[var(--color-surface)] p-4 text-[var(--color-text-muted)] transition-[border-color,background-color] duration-150 ease-[var(--ease-out)] ${
            dragging
              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/50"
              : "border-[var(--color-border)]"
          }`}
        >
          <Camera size={40} className="text-[var(--color-primary)]" aria-hidden="true" />
          <span id="photo-dropzone-label" className="max-w-[260px] text-center text-sm font-medium">
            {t("scan.dropzone")}
          </span>
          <div className="flex w-full max-w-[340px] flex-col gap-2 min-[400px]:flex-row">
            {hasCamera && (
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                aria-describedby="photo-helper"
                className="pressable flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[12px] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition-transform duration-150 ease-[var(--ease-out)]"
              >
                <Camera size={18} aria-hidden="true" /> {t("scan.takePhoto")}
              </button>
            )}
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              aria-describedby="photo-helper"
              className={`pressable flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-[12px] px-4 text-sm font-semibold transition-transform duration-150 ease-[var(--ease-out)] ${
                hasCamera
                  ? "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                  : "bg-[var(--color-primary)] text-white"
              }`}
            >
              <ImagePlus size={18} aria-hidden="true" /> {t("scan.choosePhotos")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
          {files.map((f, i) => (
            <div
              key={sourceKeyOf.get(f) ?? fileKey(f)}
              className="relative aspect-square overflow-hidden rounded-[12px] border border-[var(--color-border)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previews[i]}
                alt={t("scan.photoAlt", { n: i + 1 })}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  onChange(files.filter((_, idx) => idx !== i));
                }}
                className="pressable absolute right-0 top-0 flex h-11 w-11 items-start justify-end p-1.5 transition-transform duration-150 ease-[var(--ease-out)]"
                aria-label={`${t("common.remove")} — ${t("scan.photoAlt", { n: i + 1 })}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white">
                  <X size={16} aria-hidden="true" />
                </span>
              </button>
            </div>
          ))}
          {Array.from({ length: preparing }, (_, i) => (
            <div
              key={`preparing-${i}`}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
              role="status"
            >
              <Loader2 size={22} className="animate-spin text-[var(--color-primary)]" aria-hidden="true" />
              <span className="px-1 text-center text-[11px] leading-tight">{t("scan.preparing")}</span>
            </div>
          ))}
          {canAdd && hasCamera && (
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="pressable flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-[var(--color-border)] text-[var(--color-primary)] transition-[transform,border-color] duration-150 ease-[var(--ease-out)] disabled:opacity-50"
            >
              <Camera size={24} aria-hidden="true" />
              <span className="px-1 text-center text-[11px] font-semibold leading-tight">{t("scan.takePhoto")}</span>
            </button>
          )}
          {canAdd && (
            <button
              type="button"
              disabled={busy}
              onClick={() => galleryRef.current?.click()}
              className="pressable flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-[var(--color-border)] text-[var(--color-primary)] transition-[transform,border-color] duration-150 ease-[var(--ease-out)] disabled:opacity-50"
            >
              <ImagePlus size={24} aria-hidden="true" />
              <span className="px-1 text-center text-[11px] font-semibold leading-tight">{t("scan.choosePhotos")}</span>
            </button>
          )}
        </div>
      )}
      {/* Camera: one shot at a time (capture ignores `multiple` on phones). */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      {/* Gallery/files: no `capture`, so phones offer existing photos too.
          Listing concrete types lets iOS hand over HEIC photos as JPEG. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
      <p id="photo-helper" className="mt-2 text-xs text-[var(--color-text-muted)]">
        {t("scan.photoFormats", { max })}
      </p>
      {message && (
        <p className="mt-1 text-sm font-medium text-[var(--color-warn)]" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
