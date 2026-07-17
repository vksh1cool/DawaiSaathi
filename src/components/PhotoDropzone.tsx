"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Camera, X, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

const ACCEPTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/x-png",
  "image/webp",
]);

export function PhotoDropzone({
  files,
  onChange,
  max = 5,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  const add = (list: FileList | null) => {
    if (!list) return;
    const existing = new Set(files.map(fileKey));
    const incoming = Array.from(list);
    const supported = incoming.filter(isAcceptedImage);
    const unique = supported.filter((file) => {
      const key = fileKey(file);
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    const available = Math.max(0, max - files.length);
    const next = [...files, ...unique.slice(0, available)];
    if (supported.length !== incoming.length) setMessage(t("scan.unsupportedImage"));
    else if (unique.length !== supported.length) setMessage(t("scan.duplicateImage"));
    else if (unique.length > available) setMessage(t("scan.photoLimit", { max }));
    else setMessage(null);
    onChange(next);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    add(event.dataTransfer.files);
  };

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
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-describedby="photo-helper"
          className={`pressable flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed bg-[var(--color-surface)] text-[var(--color-text-muted)] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] ${
            dragging
              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]/50"
              : "border-[var(--color-border)]"
          }`}
        >
          <Camera size={40} className="text-[var(--color-primary)]" />
          <span className="max-w-[220px] text-center text-sm font-medium">
            {t("scan.dropzone")}
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={fileKey(f)} className="relative h-24 w-24 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
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
                className="pressable absolute right-1 top-1 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white transition-transform duration-150 ease-[var(--ease-out)]"
                aria-label={t("common.remove")}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {files.length < max && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="pressable flex h-24 w-24 items-center justify-center rounded-[12px] border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)]"
              aria-label={t("common.add")}
            >
              <Plus size={28} />
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
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

function isAcceptedImage(file: File) {
  if (ACCEPTED_IMAGE_TYPES.has(file.type)) return true;
  // A few mobile browsers leave File.type empty for a camera capture. The
  // server revalidates and normalizes this extension before processing it.
  return file.type === "" && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}
