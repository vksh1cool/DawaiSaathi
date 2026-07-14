import { PrismaClient, type Medication } from "@prisma/client";
import type {
  Salt,
  FieldConfidence,
  FrequencyHint,
  EvidenceQuote,
} from "@/types/domain";

/** Prisma singleton (avoids exhausting connections during Next.js HMR). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/* ── JSON column parsers (Arch §5) ─────────────────────────────────── */

export function parseSalts(med: Pick<Medication, "saltsJson">): Salt[] {
  try {
    return JSON.parse(med.saltsJson) as Salt[];
  } catch {
    return [];
  }
}

export function parseFieldConfidence(
  med: Pick<Medication, "fieldConfidenceJson">,
): FieldConfidence | null {
  if (!med.fieldConfidenceJson) return null;
  try {
    return JSON.parse(med.fieldConfidenceJson) as FieldConfidence;
  } catch {
    return null;
  }
}

export function parseFrequencyHint(
  med: Pick<Medication, "usualFrequencyHint">,
): FrequencyHint | null {
  if (!med.usualFrequencyHint) return null;
  try {
    return JSON.parse(med.usualFrequencyHint) as FrequencyHint;
  } catch {
    return null;
  }
}

export function parseStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export function parseEvidence(json: string | null | undefined): EvidenceQuote[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as EvidenceQuote[]) : [];
  } catch {
    return [];
  }
}
