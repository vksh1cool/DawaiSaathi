import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** openFDA label fetch + 7-day cache (Arch §9). */

const BASE = "https://api.fda.gov/drug/label.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXCERPT_MAX = 6000;

export type LabelExcerpt = { salt: string; excerpt: string; found: boolean };

// Injectable low-level fetch (tests override).
type Fetcher = (
  url: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
let fetchImpl: Fetcher = (url, init) => fetch(url, init);
export function _setOpenFdaFetch(f: Fetcher) {
  fetchImpl = f;
}
export function _resetOpenFdaFetch() {
  fetchImpl = (url, init) => fetch(url, init);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LabelDoc = {
  boxed_warning?: string[];
  drug_interactions?: string[];
  contraindications?: string[];
  warnings?: string[];
};

function buildExcerpt(doc: LabelDoc): string {
  const parts = [
    ...(doc.boxed_warning ?? []),
    ...(doc.drug_interactions ?? []),
    ...(doc.contraindications ?? []),
    ...(doc.warnings ?? []),
  ];
  return parts.join("\n").slice(0, EXCERPT_MAX);
}

async function queryLabel(field: "generic_name" | "substance_name", name: string): Promise<LabelDoc | null> {
  const key = config.openfdaApiKey ? `&api_key=${config.openfdaApiKey}` : "";
  const url = `${BASE}?search=openfda.${field}:%22${encodeURIComponent(name)}%22&limit=2${key}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetchImpl(url, { signal: controller.signal });
  } catch (err) {
    throw new AppError("UPSTREAM_OPENFDA", "openFDA is temporarily unavailable.", err);
  } finally {
    clearTimeout(timeout);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new AppError("UPSTREAM_OPENFDA", `openFDA returned ${res.status}`);
  const body = (await res.json()) as { results?: LabelDoc[] };
  return body.results?.[0] ?? null;
}

/** Fetch (and cache) the label excerpt for one salt's FDA search name. */
export async function fetchLabelExcerpt(fdaSearchName: string): Promise<LabelExcerpt> {
  const cacheKey = `openfda:label:${fdaSearchName.toLowerCase()}`;
  const cached = await prisma.apiCache.findUnique({ where: { key: cacheKey } });
  if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    try {
      return JSON.parse(cached.payload) as LabelExcerpt;
    } catch {
      // A corrupt local cache must not prevent a fresh evidence lookup.
      await prisma.apiCache.delete({ where: { key: cacheKey } }).catch(() => undefined);
    }
  }

  let doc = await queryLabel("generic_name", fdaSearchName);
  if (!doc) doc = await queryLabel("substance_name", fdaSearchName);

  const result: LabelExcerpt = doc
    ? { salt: fdaSearchName, excerpt: buildExcerpt(doc), found: true }
    : { salt: fdaSearchName, excerpt: "", found: false };

  await prisma.apiCache.upsert({
    where: { key: cacheKey },
    create: { key: cacheKey, payload: JSON.stringify(result) },
    update: { payload: JSON.stringify(result), fetchedAt: new Date() },
  });
  return result;
}

/** Fetch excerpts for many salts sequentially (150ms spacing) — Arch §9. */
export async function fetchLabelExcerpts(fdaSearchNames: string[]): Promise<LabelExcerpt[]> {
  const unique = Array.from(new Set(fdaSearchNames.map((n) => n.toLowerCase())));
  const out: LabelExcerpt[] = [];
  for (let i = 0; i < unique.length; i++) {
    try {
      out.push(await fetchLabelExcerpt(unique[i]));
    } catch (err) {
      logger.warn({ salt: unique[i], err }, "openFDA fetch failed");
      throw err instanceof AppError ? err : new AppError("UPSTREAM_OPENFDA", "openFDA unavailable");
    }
    if (i < unique.length - 1) await sleep(150);
  }
  return out;
}
