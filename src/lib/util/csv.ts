import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";

const DATA_DIR = join(process.cwd(), "data");

/** Load a CSV from /data as typed row objects (header row required). */
export function loadCsv<T = Record<string, string>>(fileName: string): T[] {
  const raw = readFileSync(join(DATA_DIR, fileName), "utf8");
  const parsed = Papa.parse<T>(raw, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep strings; callers coerce explicitly
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    throw new Error(
      `CSV parse errors in ${fileName}: ${parsed.errors.map((e) => e.message).join("; ")}`,
    );
  }
  return parsed.data;
}

export function num(v: string | undefined | null): number | null {
  if (v === undefined || v === null || v.trim() === "") return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export function intOrNull(v: string | undefined | null): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}
