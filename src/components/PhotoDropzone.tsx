"use client";

import { useRef } from "react";
import { Camera, X, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

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

  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, max);
    onChange(next);
  };

  return (
    <div>
      {files.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex min-h-[180px] w-full flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]"
        >
          <Camera size={40} className="text-[var(--color-primary)]" />
          <span className="max-w-[220px] text-center text-sm font-medium">
            {t("scan.dropzone")}
          </span>
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative h-24 w-24 overflow-hidden rounded-[12px] border border-[var(--color-border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(f)}
                alt={`medicine strip ${i + 1}`}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
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
              className="flex h-24 w-24 items-center justify-center rounded-[12px] border-2 border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]"
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
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
