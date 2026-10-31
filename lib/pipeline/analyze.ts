import type {
  AnalysisData,
  Authority,
  Cell,
  CellState,
  ChecklistItem,
  Finding,
  Priority,
  Source,
} from "@/lib/types";
import type { SourceSnapshot } from "@/lib/snapshot";
import {
  buildClaimContext,
  decomposeAspects,
  extractClaims,
  auditConflicts,
  fallbackAspects,
  authorityOf,
  AUTHORITY_ORDER,
  type AspectDecomposition,
  type ClaimContextSource,
  type ConflictCandidate,
  type ModelConflict,
  type PipelineAspect,
  type RawClaim,
} from "@/lib/pipeline/model-stages";
import {
  extractValues,
  tokenize,
  verifyQuote,
  type QuoteMethod,
  type TypedValue,
} from "@/lib/pipeline/text";

/* ------------------------------------------------------------------ types */

export interface VerifiedClaim {
  id: string;
  sourceId: string;
  domain: string;
  authority: Authority;
  aspectId: string;
  aspectLabel: string;
  statement: string;
  quote: string;
  method: QuoteMethod;
  score: number;
  values: TypedValue[];
}

export interface CaseConflict {
  id: string;
  aspectId: string;
  aspectLabel: string;
  a: VerifiedClaim;
  b: VerifiedClaim;
  summary: string;
  origin: "value" | "model";
}

export interface AnalyzeInput {
  question: string;
  sources: SourceSnapshot[];
  now?: Date;
}

export interface AnalyzeDeps {
  decompose: (question: string) => Promise<AspectDecomposition>;
  extract: (
    contexts: ClaimContextSource[],
    aspects: PipelineAspect[],
    question: string,
  ) => Promise<RawClaim[]>;
  audit: (candidates: ConflictCandidate[]) => Promise<ModelConflict[]>;
}

const defaultDeps: AnalyzeDeps = {
  decompose: decomposeAspects,
  extract: extractClaims,
  audit: auditConflicts,
};

export interface Diagnostics {
  aspectsFromModel: boolean;
  claimsFromModel: boolean;
  claimsExtracted: number;
  quotesVerified: number;
  quotesRejected: number;
  conflicts: number;
  modelNotes: string[];
}

export interface AnalyzeResult {
  analysis: AnalysisData;
  diagnostics: Diagnostics;
}

/* ------------------------------------------------------------- verification */

function toSource(snapshot: SourceSnapshot): Source {
  return {
    id: snapshot.id,
    domain: snapshot.domain,
    url: snapshot.finalUrl,
    authority: authorityOf(snapshot),
    status: snapshot.status,
    note:
      snapshot.status === "failed"
        ? `${snapshot.errorCode ?? "ERROR"}${snapshot.errorMessage ? ` · ${snapshot.errorMessage}` : ""}`
        : undefined,
  };
}

function normaliseKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Verify every extracted claim against the frozen text. A claim whose quote
 * cannot be located is reassigned if another source contains it, and dropped
 * otherwise. This is what stops the model from inventing evidence.
 */
function verifyClaims(
  raw: RawClaim[],
  snapshots: SourceSnapshot[],
  aspects: PipelineAspect[],
): { claims: VerifiedClaim[]; rejected: number } {
  const aspectById = new Map(aspects.map((aspect) => [aspect.id, aspect]));
  const readable = snapshots.filter((snapshot) => snapshot.status === "ok" && snapshot.text);
  const byId = new Map(readable.map((snapshot) => [snapshot.id, snapshot]));
  const seen = new Set<string>();
  const claims: VerifiedClaim[] = [];
  let rejected = 0;

  for (const entry of raw) {
    const aspect = aspectById.get(entry.aspectId);
    if (!aspect) continue;

    const expected = byId.get(entry.sourceId);
    const candidates = expected
      ? [expected, ...readable.filter((snapshot) => snapshot.id !== expected.id)]
      : readable;

    let matchedSource: SourceSnapshot | null = null;
    let check: ReturnType<typeof verifyQuote> | null = null;

    for (const snapshot of candidates.slice(0, 8)) {
      const result = verifyQuote(snapshot.text, entry.quote);
      if (result.verified) {
        matchedSource = snapshot;
        check = result;
        break;
      }
    }

    if (!matchedSource || !check) {
      rejected += 1;
      continue;
    }

    const quote = check.matched ?? entry.quote;
    const dedupe = `${matchedSource.id}|${aspect.id}|${normaliseKey(quote).slice(0, 120)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    claims.push({
      id: `q${claims.length + 1}`,
      sourceId: matchedSource.id,
      domain: matchedSource.domain,
      authority: authorityOf(matchedSource),
      aspectId: aspect.id,
      aspectLabel: aspect.label,
      statement: entry.statement.trim(),
      quote,
      method: check.method,
      score: check.score,
      values: extractValues(quote),
    });
  }

  return { claims, rejected };
}

/**
 * Model-free claim extraction used when the model call fails: pick the single
 * best matching sentence per aspect. The quote is a real sentence by
 * construction, so it is always verifiable.
 */
function heuristicClaims(
  contexts: ClaimContextSource[],
  aspects: PipelineAspect[],
): RawClaim[] {
  const output: RawClaim[] = [];

  for (const context of contexts) {
    const sentences = context.snapshot.text
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 40 && sentence.length <= 420);

    for (const aspect of aspects) {
      const keywords = new Set(tokenize(`${aspect.label} ${aspect.keywords.join(" ")}`));
      if (keywords.size === 0) continue;

      let best: { sentence: string; score: number } | null = null;
      for (const sentence of sentences) {
        const tokens = new Set(tokenize(sentence));
        let hits = 0;
        for (const keyword of keywords) if (tokens.has(keyword)) hits += 1;
        const score = hits / Math.sqrt(keywords.size * Math.max(tokens.size, 1));
        if (hits >= 2 && (!best || score > best.score)) best = { sentence, score };
      }

      if (best && best.score > 0.04) {
        output.push({
          sourceId: context.snapshot.id,
          aspectId: aspect.id,
          statement: best.sentence.slice(0, 220),
          quote: best.sentence,
        });
      }
    }
  }

  return output;
}

/* ---------------------------------------------------------------- coverage */

function claimStrength(claim: VerifiedClaim): number {
  let strength = 2;
  if (claim.values.length > 0) strength += 1;
  if (claim.quote.length >= 70) strength += 1;
  if (claim.method !== "fuzzy") strength += 0.5;
  return strength;
}

function cellStrength(claims: VerifiedClaim[]): number {
  return claims
    .map(claimStrength)
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reduce((sum, value) => sum + value, 0);
}

function stateFor(claims: VerifiedClaim[]): CellState {
  if (claims.length === 0) return "missing";
  const strength = cellStrength(claims);
  if (strength >= 3) return "covered";
  if (strength >= 1) return "partial";
  return "missing";
}

function buildCells(
  sources: Source[],
  aspects: PipelineAspect[],
  claims: VerifiedClaim[],
): Cell[] {
  return sources.flatMap((source) =>
    aspects.map((aspect) => {
      if (source.status === "failed") {
        return { aspectId: aspect.id, sourceId: source.id, state: "unavailable" as CellState };
      }
      const relevant = claims.filter(
        (claim) => claim.sourceId === source.id && claim.aspectId === aspect.id,
      );
      return { aspectId: aspect.id, sourceId: source.id, state: stateFor(relevant) };
    }),
  );
}

/* --------------------------------------------------------------- conflicts */

function valueSet(claim: VerifiedClaim, kind: TypedValue["kind"]): string[] {
  return claim.values.filter((value) => value.kind === kind).map((value) => value.normalized);
}

/** Same-kind facts that cannot both be true: a deterministic first pass. */
function valueConflicts(claims: VerifiedClaim[], aspects: PipelineAspect[]): CaseConflict[] {
  const conflicts: CaseConflict[] = [];
  const kinds: TypedValue["kind"][] = ["percent", "money", "date", "duration"];

  for (const aspect of aspects) {
    const relevant = claims.filter((claim) => claim.aspectId === aspect.id);
    for (let i = 0; i < relevant.length; i += 1) {
      for (let j = i + 1; j < relevant.length; j += 1) {
        const a = relevant[i];
        const b = relevant[j];
        if (a.sourceId === b.sourceId) continue;

        for (const kind of kinds) {
          const setA = valueSet(a, kind);
          const setB = valueSet(b, kind);
          if (setA.length === 0 || setB.length === 0) continue;
          if (setA.some((value) => setB.includes(value))) continue;

          const fmt = (claim: VerifiedClaim) =>
            claim.values
              .filter((value) => value.kind === kind)
              .map((value) => value.raw.trim())
              .slice(0, 2)
              .join(", ");

          conflicts.push({
            id: `cv${conflicts.length + 1}`,
            aspectId: aspect.id,
            aspectLabel: aspect.label,
            a,
            b,
            summary: `${a.domain} says ${fmt(a)}, while ${b.domain} says ${fmt(b)}.`,
            origin: "value",
          });
          break;
        }
      }
    }
  }

  return conflicts.slice(0, 4);
}

function mergeConflicts(
  deterministic: CaseConflict[],
  modelled: { aspectId: string; claimA: string; claimB: string; summary: string }[],
  claims: VerifiedClaim[],
  aspects: PipelineAspect[],
): CaseConflict[] {
  const byId = new Map(claims.map((claim) => [claim.id, claim]));
  const aspectById = new Map(aspects.map((aspect) => [aspect.id, aspect]));
  const output = [...deterministic];

  const seenPairs = new Set(
    deterministic.map((conflict) =>
      [conflict.a.id, conflict.b.id].sort().join("|"),
    ),
  );

  for (const entry of modelled) {
    const a = byId.get(entry.claimA);
    const b = byId.get(entry.claimB);
    const aspect = aspectById.get(entry.aspectId);
    if (!a || !b || !aspect || a.sourceId === b.sourceId) continue;
    const pair = [a.id, b.id].sort().join("|");
    if (seenPairs.has(pair)) continue;
    seenPairs.add(pair);

    output.push({
      id: `cm${output.length + 1}`,
      aspectId: aspect.id,
      aspectLabel: aspect.label,
      a,
      b,
      summary: entry.summary.trim(),
      origin: "model",
    });
  }

  return output.slice(0, 6);
}

/* --------------------------------------------------------------- staleness */

interface StaleFinding {
  id: string;
  title: string;
  detail: string;
  aspectId: string | null;
}

const DEADLINE_HINT = /\b(deadline|last date|closing date|closes|apply by|due date|expires?|expiry)\b/i;

function assessStaleness(
  snapshots: SourceSnapshot[],
  claims: VerifiedClaim[],
  now: Date,
  aspects: PipelineAspect[],
): StaleFinding[] {
  const findings: StaleFinding[] = [];
  const day = 86_400_000;

  for (const snapshot of snapshots) {
    if (snapshot.status !== "ok" || !snapshot.publishedAt) continue;
    const published = new Date(snapshot.publishedAt);
    if (Number.isNaN(published.getTime())) continue;
    const ageDays = Math.floor((now.getTime() - published.getTime()) / day);
    if (ageDays < 365) continue;

    const years = (ageDays / 365).toFixed(1);
    const authority = authorityOf(snapshot);
    findings.push({
      id: `st${findings.length + 1}`,
      title:
        authority === "official"
          ? `Official page may predate the current cycle (published ${years} years ago)`
          : `${snapshot.domain} was published ${years} years ago`,
      detail: `The page carries a ${snapshot.dateConfidence}-confidence publish date of ${published
        .toISOString()
        .slice(0, 10)}. Rules, amounts and deadlines may have changed since then.`,
      aspectId: null,
    });
  }

  for (const claim of claims) {
    const text = `${claim.statement} ${claim.quote}`;
    if (!DEADLINE_HINT.test(text)) continue;
    const dates = claim.values.filter((value) => value.kind === "date");
    const past = dates.find((value) => new Date(value.normalized) < now);
    if (!past) continue;

    findings.push({
      id: `st${findings.length + 1}`,
      title: `A cited deadline has already passed (${past.raw.trim()})`,
      detail: `"${claim.quote.replace(/\s+/g, " ").slice(0, 180)}" — ${claim.domain} refers to ${past.normalized}. Confirm whether a newer cycle is open.`,
      aspectId: claim.aspectId,
    });
  }

  // Undated pages that only talk about older years.
  if (!snapshots.some((snapshot) => snapshot.publishedAt)) {
    const currentYear = now.getUTCFullYear();
    const staleYear = snapshots
      .filter((snapshot) => snapshot.status === "ok")
      .map((snapshot) => {
        const years = [...snapshot.text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
        return years.length > 0 ? Math.max(...years) : null;
      })
      .filter((year): year is number => year !== null && year <= currentYear - 2);

    if (staleYear.length > 0) {
      const newest = Math.max(...staleYear);
      findings.push({
        id: `st${findings.length + 1}`,
        title: `Sources have no publish date and refer to ${newest} at the latest`,
        detail:
          "No reliable publish date was found, and the newest year mentioned is at least two years old. Treat amounts and rules as unconfirmed.",
        aspectId: null,
      });
    }
  }

  void aspects;
  return findings.slice(0, 3);
}

/* ---------------------------------------------------------------- findings */

function gapFindings(
  sources: Source[],
  aspects: PipelineAspect[],
  cells: Cell[],
  failedCount: number,
): Finding[] {
  const readable = sources.filter((source) => source.status === "ok");
  const findings: Finding[] = [];

  for (const aspect of aspects) {
    const aspectCells = cells.filter((cell) => cell.aspectId === aspect.id);
    const covered = aspectCells.filter((cell) => cell.state === "covered").length;
    const partial = aspectCells.filter((cell) => cell.state === "partial").length;
    if (covered > 0) continue;

    const officialMissing = aspectCells.some(
      (cell) =>
        cell.state === "missing" &&
        sources.find((source) => source.id === cell.sourceId)?.authority === "official",
    );

    findings.push({
      id: `g${findings.length + 1}`,
      kind: "gap",
      title:
        partial > 0
          ? `Only partial evidence for ${aspect.label.toLowerCase()}`
          : `No source states ${aspect.label.toLowerCase()}`,
      detail:
        partial > 0
          ? `${partial} of ${readable.length} readable sources touch on ${aspect.label.toLowerCase()}, but none give a complete, quotable answer.${
              failedCount > 0 ? " One source could not be read, so this may be a gap in reach rather than in fact." : ""
            }`
          : `None of the ${readable.length} readable sources contain a verifiable statement about ${aspect.label.toLowerCase()}.${
              failedCount > 0
                ? ` ${failedCount} source${failedCount === 1 ? "" : "s"} could not be read, so treat this as unconfirmed rather than absent.`
                : ""
            }${
              officialMissing
                ? " No official source covers it, which raises the stakes on confirming it directly."
                : ""
            }`,
    });
  }

  return findings.slice(0, 4);
}

function conflictFindings(conflicts: CaseConflict[]): Finding[] {
  return conflicts.map((conflict, index) => ({
    id: `c${index + 1}`,
    kind: "conflict",
    title: `Sources disagree on ${conflict.aspectLabel.toLowerCase()}`,
    detail: `${conflict.summary} “${conflict.a.quote.replace(/\s+/g, " ").slice(0, 120)}” (${conflict.a.domain}) vs “${conflict.b.quote
      .replace(/\s+/g, " ")
      .slice(0, 120)}” (${conflict.b.domain}).`,
  }));
}

/* --------------------------------------------------------------- checklist */

const PRIORITY_ORDER: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 };

function buildChecklist(
  conflicts: CaseConflict[],
  findings: Finding[],
  sources: Source[],
  aspects: PipelineAspect[],
): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const official = sources.find((source) => source.authority === "official" && source.status === "ok");
  const best = official ?? sources.find((source) => source.status === "ok") ?? sources[0];

  for (const conflict of conflicts) {
    items.push({
      id: `k${items.length + 1}`,
      text: `Resolve the conflicting ${conflict.aspectLabel.toLowerCase()} between ${conflict.a.domain} and ${conflict.b.domain}`,
      whereToLook: `Where to look: the official wording on ${best?.domain ?? "the primary source"}, not a summary`,
      priority: "High",
    });
  }

  for (const finding of findings.filter((entry) => entry.kind === "gap").slice(0, 3)) {
    const aspect = aspects.find((entry) =>
      finding.title.toLowerCase().includes(entry.label.toLowerCase()),
    );
    items.push({
      id: `k${items.length + 1}`,
      text: `Confirm ${aspect ? aspect.label.toLowerCase() : "the missing detail"} directly${official ? ` on ${official.domain}` : ""}`,
      whereToLook: `Where to look: ${official ? `${official.domain} — official rules, FAQ or notice board` : "the scheme's official page or a phone contact"}`,
      priority: official ? "High" : "Medium",
    });
  }

  for (const finding of findings.filter((entry) => entry.kind === "outdated").slice(0, 2)) {
    items.push({
      id: `k${items.length + 1}`,
      text: finding.title,
      whereToLook: "Where to look: the current cycle's notice, not an archived page",
      priority: "Medium",
    });
  }

  for (const source of sources.filter((entry) => entry.status === "failed").slice(0, 1)) {
    items.push({
      id: `k${items.length + 1}`,
      text: `Retry ${source.domain}, or paste its text manually`,
      whereToLook: "Where to look: open the page in a browser and copy the main content",
      priority: "Low",
    });
  }

  if (items.length === 0) {
    for (const aspect of aspects.slice(0, 3)) {
      items.push({
        id: `k${items.length + 1}`,
        text: `Spot-check ${aspect.label.toLowerCase()} against the original page`,
        whereToLook: `Where to look: ${best?.domain ?? "the primary source"}`,
        priority: "Low",
      });
    }
  }

  return items
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 6)
    .map((item, index) => ({ ...item, id: `k${index + 1}` }));
}

/* ---------------------------------------------------------------- evidence */

function buildEvidence(
  claims: VerifiedClaim[],
  sources: Source[],
  snapshots: SourceSnapshot[],
): AnalysisData["evidence"] {
  const ranked = [...claims].sort((a, b) => {
    const authority = AUTHORITY_ORDER[a.authority] - AUTHORITY_ORDER[b.authority];
    if (authority !== 0) return authority;
    const values = b.values.length - a.values.length;
    if (values !== 0) return values;
    return b.quote.length - a.quote.length;
  });

  const best = ranked[0];
  const snapshot = best
    ? snapshots.find((entry) => entry.id === best.sourceId)
    : snapshots.find((entry) => entry.status === "ok");

  return {
    quote: best?.quote.replace(/\s+/g, " ").slice(0, 400) ?? "No verified quote was available.",
    domain: best?.domain ?? snapshot?.domain ?? "unknown",
    fetchedAt: snapshot
      ? `fetched ${new Date(snapshot.fetchedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        })}`
      : "fetched just now",
    sha256: snapshot?.sha256 ? `sha256:${snapshot.sha256.slice(0, 12)}…` : "sha256:unavailable",
    sourceCount: sources.filter((source) => source.status === "ok").length,
    quoteCount: claims.length,
  };
}

/* -------------------------------------------------------------------- main */

export async function analyze(
  input: AnalyzeInput,
  deps: AnalyzeDeps = defaultDeps,
): Promise<AnalyzeResult> {
  const now = input.now ?? new Date();
  const startedAt = Date.now();
  const modelNotes: string[] = [];
  const sources = input.sources.map(toSource);

  const decomposed = await deps.decompose(input.question);
  const aspects = decomposed.aspects.length > 0 ? decomposed.aspects : fallbackAspects();
  if (!decomposed.fromModel) modelNotes.push("aspects: heuristic fallback");

  const contexts = buildClaimContext(input.sources, aspects);

  let rawClaims: RawClaim[] = [];
  let claimsFromModel = true;
  try {
    rawClaims = await deps.extract(contexts, aspects, input.question);
  } catch (error) {
    claimsFromModel = false;
    modelNotes.push(
      `claims: ${error instanceof Error ? error.message.slice(0, 120) : "model call failed"}`,
    );
    rawClaims = heuristicClaims(contexts, aspects);
  }

  const verified = verifyClaims(rawClaims, input.sources, aspects);
  const claims = verified.claims;

  const cells = buildCells(sources, aspects, claims);
  const conflictState = new Map<string, CellState>();
  const localConflicts = valueConflicts(claims, aspects);

  let modelled: { aspectId: string; claimA: string; claimB: string; summary: string }[] = [];
  const elapsed = Date.now() - startedAt;
  if (claimsFromModel && claims.length >= 2 && elapsed < 30_000) {
    const candidates: ConflictCandidate[] = claims.slice(0, 24).map((claim) => ({
      id: claim.id,
      aspectId: claim.aspectId,
      domain: claim.domain,
      statement: claim.statement,
      quote: claim.quote,
    }));
    try {
      modelled = await deps.audit(candidates);
    } catch (error) {
      modelNotes.push(
        `conflicts: ${error instanceof Error ? error.message.slice(0, 120) : "model call failed"}`,
      );
    }
  } else if (claimsFromModel && claims.length >= 2) {
    modelNotes.push("conflicts: model audit skipped to stay inside the time budget");
  }

  const conflicts = mergeConflicts(localConflicts, modelled, claims, aspects);
  for (const conflict of conflicts) {
    conflictState.set(`${conflict.a.sourceId}|${conflict.aspectId}`, "conflict");
    conflictState.set(`${conflict.b.sourceId}|${conflict.aspectId}`, "conflict");
  }
  for (const cell of cells) {
    const state = conflictState.get(`${cell.sourceId}|${cell.aspectId}`);
    if (state) cell.state = state;
  }

  const stale = assessStaleness(input.sources, claims, now, aspects);
  const failedCount = sources.filter((source) => source.status === "failed").length;

  const findings: Finding[] = [
    ...conflictFindings(conflicts),
    ...gapFindings(sources, aspects, cells, failedCount),
    ...stale.map((entry, index) => ({
      id: `o${index + 1}`,
      kind: "outdated" as const,
      title: entry.title,
      detail: entry.detail,
    })),
  ];

  const rejectedRatio =
    verified.rejected + claims.length > 0
      ? verified.rejected / (verified.rejected + claims.length)
      : 0;
  const readableCount = sources.filter((source) => source.status === "ok").length;
  const reducedConfidence =
    failedCount > 0 || readableCount < 2 || rejectedRatio > 0.25 || !claimsFromModel;

  const statusParts = [
    `${readableCount} of ${sources.length} sources read`,
    failedCount > 0 ? `${failedCount} failed` : null,
    `${claims.length} quotes verified`,
    reducedConfidence ? "reduced confidence" : null,
  ].filter(Boolean);

  const analysis: AnalysisData = {
    question: input.question,
    statusLine: statusParts.join(" · "),
    reducedConfidence,
    sources,
    aspects: aspects.map(({ id, label, icon, tint }) => ({ id, label, icon, tint })),
    cells,
    findings,
    checklist: buildChecklist(conflicts, findings, sources, aspects),
    evidence: buildEvidence(claims, sources, input.sources),
  };

  return {
    analysis,
    diagnostics: {
      aspectsFromModel: decomposed.fromModel,
      claimsFromModel,
      claimsExtracted: rawClaims.length,
      quotesVerified: claims.length,
      quotesRejected: verified.rejected,
      conflicts: conflicts.length,
      modelNotes,
    },
  };
}
