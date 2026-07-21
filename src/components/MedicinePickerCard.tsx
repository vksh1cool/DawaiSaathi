"use client";

import { Check, Plus } from "lucide-react";
import { Badge } from "@/components/ui";
import type { BrandPrice } from "@/lib/reference-data";

export function MedicinePickerCard({
  brand,
  selected,
  onToggle,
}: {
  brand: BrandPrice;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`card-shadow pressable flex h-full flex-col gap-2 rounded-[16px] border p-3 text-left transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
        selected
          ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-tight text-[var(--color-text)]">{brand.brandName}</p>
          <p className="truncate text-xs capitalize text-[var(--color-text-muted)]">{brand.genericName}</p>
        </div>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
            selected
              ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
              : "border-[var(--color-border)] text-[var(--color-text-muted)]"
          }`}
        >
          {selected ? <Check size={16} /> : <Plus size={16} />}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge>
          {brand.strengthValue ? `${brand.strengthValue}${brand.strengthUnit}` : brand.form} · {brand.form}
        </Badge>
        {brand.packSize != null && <Badge>{brand.packSize}/pack</Badge>}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-[var(--color-text-muted)]">
        <span className="truncate">{brand.manufacturer}</span>
        {brand.mrpInr != null && (
          <span className="shrink-0 font-semibold text-[var(--color-text)]">₹{brand.mrpInr.toFixed(2)}</span>
        )}
      </div>
    </button>
  );
}
