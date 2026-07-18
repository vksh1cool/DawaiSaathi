import { prisma } from "@/lib/db";
import { parseSalts, parseEvidence } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { callLLM } from "@/lib/openai";
import {
  INTERACTION_SYSTEM,
  INTERACTION_SCHEMA,
  interactionZod,
} from "@/lib/prompts";
import { findCuratedInteraction } from "@/lib/reference-data";
import { fetchLabelExcerpts } from "@/lib/integrations/openfda";
import type { Finding, Severity, FindingSource, EvidenceQuote } from "@/types/domain";
import { cuid } from "@/lib/util/id";

export type MedSalt = { medId: string; brand: string; inn: string; fdaSearchName: string };

const consultEn = "Discuss with your doctor or pharmacist before the next dose.";
const consultHi = "अगली खुराक से पहले डॉक्टर या फार्मासिस्ट से बात करें।";

/** Ensure the action line always ends with a consult instruction (PRD §9.3). */
export function ensureConsult(action: string, lang: "en" | "hi"): string {
  const needle = lang === "en" ? "pharmacist" : "फार्मासिस्ट";
  const doctor = lang === "en" ? "doctor" : "डॉक्टर";
  if (action.toLowerCase().includes(needle) || action.includes(doctor)) return action;
  return `${action} ${lang === "en" ? consultEn : consultHi}`.trim();
}

const subst = (text: string, aLabel: string, bLabel: string) =>
  text.replaceAll("{a}", aLabel).replaceAll("{b}", bLabel);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export type InteractionRunResult = {
  findings: Finding[];
  checkedMedsCount: number;
  ranAt: string;
  degraded?: "openfda_unavailable";
};

/**
 * Three-layer interaction engine with strict post-validation (Arch §8.4, PRD F3).
 * Curated wins; openFDA needs a verbatim quote; LLM-only is always unverified.
 */
export async function runInteractions(patientId: string): Promise<InteractionRunResult> {
  const meds = await prisma.medication.findMany({
    where: { patientId, status: "active" },
  });

  // Flatten salts, tracking which medication each belongs to.
  const medSalts: MedSalt[] = [];
  for (const m of meds) {
    for (const s of parseSalts(m)) {
      if (s.inn.trim()) {
        medSalts.push({
          medId: m.id,
          brand: m.brandName,
          inn: s.inn.toLowerCase(),
          fdaSearchName: s.fdaSearchName || s.inn,
        });
      }
    }
  }

  const runId = cuid();
  const findings: Finding[] = [];
  const curatedPairKeys = new Set<string>();

  const label = (ms: MedSalt) => `${ms.brand} (${ms.inn})`;
  const pairKeyOf = (a: string, b: string) => [a, b].sort().join("|");

  // ── Layer 1: curated (deterministic) ──────────────────────────────
  for (let i = 0; i < medSalts.length; i++) {
    for (let j = i + 1; j < medSalts.length; j++) {
      const a = medSalts[i];
      const b = medSalts[j];
      if (a.medId === b.medId) continue; // co-formulated, skip
      if (a.inn === b.inn) continue;
      const hit = findCuratedInteraction(a.inn, b.inn);
      if (!hit) continue;
      const pk = pairKeyOf(a.inn, b.inn);
      if (curatedPairKeys.has(pk)) continue;
      curatedPairKeys.add(pk);

      // Align a/b to the curated row's saltA/saltB for correct substitution.
      const aIsRowA = hit.saltA === a.inn;
      const aLabel = aIsRowA ? label(a) : label(b);
      const bLabel = aIsRowA ? label(b) : label(a);

      findings.push({
        id: cuid(),
        pairKey: pk,
        medAId: a.medId,
        medBId: b.medId,
        saltA: a.inn,
        saltB: b.inn,
        brandA: a.brand,
        brandB: b.brand,
        severity: hit.severity,
        source: "curated",
        explanationEn: subst(hit.explanationEn, aLabel, bLabel),
        explanationHi: subst(hit.explanationHi, aLabel, bLabel),
        actionEn: ensureConsult(hit.actionEn, "en"),
        actionHi: ensureConsult(hit.actionHi, "hi"),
        evidence: [{ source: "curated", quote: hit.mechanismEn }],
        acknowledged: false,
      });
    }
  }

  // ── Layers 2+3: openFDA-grounded + LLM suspicion ──────────────────
  let degraded: "openfda_unavailable" | undefined;
  const excerptBySalt = new Map<string, string>();

  if (medSalts.length >= 2) {
    try {
      const excerpts = await fetchLabelExcerpts(medSalts.map((m) => m.fdaSearchName));
      for (const e of excerpts) excerptBySalt.set(e.salt.toLowerCase(), e.excerpt);
      if (excerpts.some((excerpt) => !excerpt.found)) degraded = "openfda_unavailable";
    } catch (err) {
      logger.warn({ err }, "openFDA layer skipped — degraded");
      degraded = "openfda_unavailable";
    }

    try {
      const llm = await runInteractionLLM(meds, medSalts, findings, excerptBySalt);
      for (const f of llm) {
        const pk = pairKeyOf(f.saltA, f.saltB);
        if (curatedPairKeys.has(pk)) continue; // no duplicates of curated
        if (findings.some((x) => x.pairKey === pk)) continue;

        // Locate a pair on different medicines. A simple `.find()` can select
        // two salts from the same combination medicine when the patient has a
        // duplicate salt elsewhere, silently dropping a valid interaction.
        const pair = findDistinctMedicationPair(medSalts, f.saltA, f.saltB);
        if (!pair) continue;
        const { a, b } = pair;

        // Evidence gating (AC-4.3).
        let source: FindingSource = f.source;
        let severity: Severity = f.severity;
        const evidence: EvidenceQuote[] = [];
        const evidenceSalt = resolveEvidenceSalt(f.evidenceLabelSalt, f.saltA, medSalts);
        const labelExcerpt = evidenceSalt ? excerptBySalt.get(evidenceSalt) ?? "" : "";
        // The quote must come from the exact label named by the model, not
        // merely from another medication's combined excerpt.
        const quoteOk = !!f.evidenceQuote && norm(labelExcerpt).includes(norm(f.evidenceQuote));
        if (f.source === "openfda") {
          if (quoteOk) {
            evidence.push({
              source: `openfda:${evidenceSalt}`,
              quote: f.evidenceQuote!,
            });
          } else {
            // Unsupported openFDA claim → demote.
            source = "llm_suspected";
            severity = "unverified";
          }
        }
        if (source === "llm_suspected") severity = "unverified";
        // Major only allowed for curated or quoted-openFDA.
        if (severity === "major" && !(source === "openfda" && quoteOk)) severity = "moderate";

        findings.push({
          id: cuid(),
          pairKey: pk,
          medAId: a.medId,
          medBId: b.medId,
          saltA: a.inn,
          saltB: b.inn,
          brandA: a.brand,
          brandB: b.brand,
          severity,
          source,
          explanationEn: f.explanationEn,
          explanationHi: f.explanationHi,
          actionEn: ensureConsult(f.actionEn, "en"),
          actionHi: ensureConsult(f.actionHi, "hi"),
          evidence,
          acknowledged: false,
        });
      }
    } catch (err) {
      logger.warn({ err }, "interaction LLM failed — curated results only");
    }
  }

  await persistFindings(patientId, runId, findings);

  return {
    findings,
    checkedMedsCount: meds.length,
    ranAt: new Date().toISOString(),
    degraded,
  };
}

export function findDistinctMedicationPair(
  medSalts: MedSalt[],
  saltA: string,
  saltB: string,
): { a: MedSalt; b: MedSalt } | null {
  for (const a of medSalts) {
    if (a.inn !== saltA) continue;
    for (const b of medSalts) {
      if (b.inn === saltB && b.medId !== a.medId) return { a, b };
    }
  }
  return null;
}

/** Map an INN or FDA search-name emitted by the model to a fetched label key. */
function resolveEvidenceSalt(
  requested: string | null,
  fallbackInn: string,
  medSalts: MedSalt[],
): string | null {
  const target = norm(requested || fallbackInn);
  const match = medSalts.find(
    (salt) => norm(salt.inn) === target || norm(salt.fdaSearchName) === target,
  );
  return match?.fdaSearchName.toLowerCase() ?? null;
}

async function runInteractionLLM(
  meds: { id: string; brandName: string }[],
  medSalts: MedSalt[],
  curated: Finding[],
  excerptBySalt: Map<string, string>,
) {
  const medList = meds.map((m) => ({
    brand: m.brandName,
    salts: medSalts.filter((s) => s.medId === m.id).map((s) => s.inn),
  }));
  const curatedContext = curated.map((c) => ({ saltA: c.saltA, saltB: c.saltB }));
  const excerpts = Array.from(excerptBySalt.entries())
    .filter(([, ex]) => ex.trim())
    .map(([salt, ex]) => `[source:openfda:${salt}]\n${ex.slice(0, 6000)}`)
    .join("\n\n");

  const { findings } = await callLLM({
    system: INTERACTION_SYSTEM,
    content: [
      {
        type: "text",
        text: JSON.stringify({ medicines: medList, alreadyFoundCuratedPairs: curatedContext }),
      },
      { type: "text", text: `FDA label excerpts:\n${excerpts || "(none available)"}` },
    ],
    schemaName: "interaction_result",
    jsonSchema: INTERACTION_SCHEMA,
    zodSchema: interactionZod,
  });

  const validInns = new Set(medSalts.map((m) => m.inn));
  return findings
    .map((f) => ({ ...f, saltA: f.saltA.toLowerCase(), saltB: f.saltB.toLowerCase() }))
    .filter((f) => validInns.has(f.saltA) && validInns.has(f.saltB) && f.saltA !== f.saltB);
}

/** Replace unacknowledged findings; keep acknowledged ones (Arch §7.3). */
async function persistFindings(patientId: string, runId: string, findings: Finding[]) {
  await prisma.$transaction([
    prisma.interactionFinding.deleteMany({ where: { patientId, acknowledged: false } }),
    ...findings.map((f) =>
      prisma.interactionFinding.create({
        data: {
          id: f.id,
          patientId,
          runId,
          pairKey: f.pairKey,
          medAId: f.medAId,
          medBId: f.medBId,
          saltA: f.saltA,
          saltB: f.saltB,
          severity: f.severity,
          source: f.source,
          explanationEn: f.explanationEn,
          explanationHi: f.explanationHi,
          actionEn: f.actionEn,
          actionHi: f.actionHi,
          evidenceJson: JSON.stringify(f.evidence),
          acknowledged: false,
        },
      }),
    ),
  ]);
}

export type StoredFinding = Awaited<ReturnType<typeof prisma.interactionFinding.findFirst>>;

export function serializeFinding(row: NonNullable<StoredFinding>, brandMap: Map<string, string>): Finding {
  return {
    id: row.id,
    pairKey: row.pairKey,
    medAId: row.medAId,
    medBId: row.medBId,
    saltA: row.saltA,
    saltB: row.saltB,
    brandA: brandMap.get(row.medAId) ?? row.saltA,
    brandB: brandMap.get(row.medBId) ?? row.saltB,
    severity: row.severity as Severity,
    source: row.source as FindingSource,
    explanationEn: row.explanationEn,
    explanationHi: row.explanationHi,
    actionEn: row.actionEn,
    actionHi: row.actionHi,
    evidence: parseEvidence(row.evidenceJson),
    acknowledged: row.acknowledged,
  };
}
