import { PrismaClient, type Medication, type Prisma } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
import { cache } from "react";
import { getD1Binding, usesD1, usesSupabaseAuth } from "@/lib/cloudflare-runtime";
import { AppError } from "@/lib/errors";
import type {
  Salt,
  FieldConfidence,
  FrequencyHint,
  EvidenceQuote,
} from "@/types/domain";

/** Prisma singleton for the local SQLite runtime (avoids HMR connections). */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getLocalPrisma(): PrismaClient {
  const local =
    globalForPrisma.prisma ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = local;
  return local;
}

/**
 * Creates one Prisma client per request when deployed on Workers. D1's
 * adapter is request-bound, so caching a global Prisma client would leak an
 * I/O capability across requests. React's cache is intentionally request
 * scoped for server work; local SQLite retains its familiar singleton.
 */
export const getPrisma = cache((): PrismaClient => {
  if (usesSupabaseAuth()) {
    throw new AppError(
      "TENANT_RUNTIME_PENDING",
      "Secure data migration is still being completed.",
    );
  }
  if (!usesD1()) return getLocalPrisma();
  return new PrismaClient({ adapter: new PrismaD1(getD1Binding()) });
});

/**
 * Existing domain code uses `prisma.model.method()`. A forwarding proxy keeps
 * that call surface stable while selecting the correct request-scoped client.
 * The proxy itself has no request state.
 *
 * Prisma's D1 adapter currently has no transaction support. The application
 * already uses conditional/idempotent writes for reminder paths; this fallback
 * preserves those flows on D1 while the local SQLite runtime remains atomic.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    if (property === "$transaction" && usesD1()) {
      return async <T>(
        input:
          | ((tx: Prisma.TransactionClient) => Promise<T>)
          | readonly PromiseLike<unknown>[],
      ): Promise<T | unknown[]> => {
        if (typeof input === "function") {
          return input(client as unknown as Prisma.TransactionClient);
        }
        return Promise.all(input);
      };
    }
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

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
