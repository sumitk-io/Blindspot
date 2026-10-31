import { z } from "zod";
import { generateJson, GeminiError } from "@/lib/gemini";
import type { Aspect, AspectIcon, Authority } from "@/lib/types";
import { selectContext } from "@/lib/pipeline/text";
import type { SourceSnapshot } from "@/lib/snapshot";

export interface PipelineAspect extends Aspect {
  keywords: string[];
  why?: string;
}

/* ---------------------------------------------------------------- aspects */

const AspectReply = z.object({
  aspects: z
    .array(
      z.object({
        label: z.string().min(2).max(42),
        why: z.string().max(180).optional(),
        keywords: z.array(z.string().min(2).max(32)).max(10).optional(),
      }),
    )
    .min(3)
    .max(6),
});

const ICONS: { icon: AspectIcon; words: string[] }[] = [
  { icon: "users", words: ["eligib", "who", "requirement", "qualif", "beneficiar", "candidate"] },
  { icon: "calendar", words: ["deadline", "date", "when", "timeline", "schedule", "window"] },
  { icon: "file", words: ["document", "paper", "proof", "certificate", "form", "evidence"] },
  { icon: "refresh", words: ["renew", "reapply", "continu", "ongoing", "repeat"] },
  { icon: "settings", words: ["process", "how", "step", "procedure", "apply", "submit"] },
  { icon: "layers", words: ["amount", "cost", "fee", "money", "price", "payment", "salary", "fund"] },
];

const TINTS = [
  "bg-emerald-50 text-emerald-600",
  "bg-sky-50 text-sky-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
  "bg-pink-50 text-pink-600",
];

function pickIcon(label: string): AspectIcon {
  const lower = label.toLowerCase();
  for (const entry of ICONS) {
    if (entry.words.some((word) => lower.includes(word))) return entry.icon;
  }
  return "file";
}

function slugify(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "aspect";
  let id = base;
  let counter = 2;
  while (taken.has(id)) {
    id = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(id);
  return id;
}

function buildAspects(
  raw: { label: string; why?: string; keywords?: string[] }[],
): PipelineAspect[] {
  const taken = new Set<string>();
  return raw.map((entry, index) => ({
    id: slugify(entry.label, taken),
    label: entry.label.trim(),
    icon: pickIcon(entry.label),
    tint: TINTS[index % TINTS.length],
    keywords: (entry.keywords ?? []).map((word) => word.toLowerCase()),
    why: entry.why,
  }));
}

const FALLBACK: { label: string; keywords: string[] }[] = [
  { label: "Key facts", keywords: ["fact", "definition", "overview", "states", "said"] },
  { label: "Requirements", keywords: ["requirement", "eligible", "must", "need", "qualify"] },
  { label: "Dates & deadlines", keywords: ["deadline", "date", "closing", "last date", "open"] },
  { label: "Process", keywords: ["process", "apply", "submit", "step", "procedure"] },
  { label: "Costs & amounts", keywords: ["amount", "fee", "cost", "price", "pay", "percent"] },
  { label: "Official confirmation", keywords: ["official", "notice", "government", "authority", "announce"] },
];

export function fallbackAspects(): PipelineAspect[] {
  return buildAspects(FALLBACK);
}

export interface AspectDecomposition {
  aspects: PipelineAspect[];
  fromModel: boolean;
}

/**
 * Break a broad question into 3-6 aspects that can each be checked against a
 * source. Falls back to generic aspects if the model is unavailable.
 */
export async function decomposeAspects(question: string): Promise<AspectDecomposition> {
  try {
    const reply = await generateJson({
      label: "aspects",
      system: [
        "You split a research question into the distinct aspects a reader would need to verify before trusting an answer.",
        "Return 3 to 6 aspects. Each aspect must be answerable by a specific passage in a document.",
        "Prefer concrete nouns people search for (eligibility, deadline, documents, fees, renewal, process).",
        "Do not include aspects that are only about the quality of sources; those are checked separately.",
        "Give each aspect a short label of at most 4 words and up to 8 search keywords.",
      ].join(" "),
      prompt: `Question: ${question}\n\nReturn JSON: { "aspects": [ { "label": string, "why": string, "keywords": string[] } ] }`,
      schema: AspectReply,
      temperature: 0.2,
      maxOutputTokens: 1200,
      timeoutMs: 30_000,
    });

    const seen = new Set<string>();
    const unique = reply.aspects.filter((entry) => {
      const key = entry.label.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique.length >= 3
      ? { aspects: buildAspects(unique), fromModel: true }
      : { aspects: fallbackAspects(), fromModel: false };
  } catch (error) {
    if (error instanceof GeminiError && (error.code === "NO_KEY" || error.code === "AUTH")) {
      throw error;
    }
    return { aspects: fallbackAspects(), fromModel: false };
  }
}

/* ----------------------------------------------------------------- claims */

const ClaimReply = z.object({
  claims: z
    .array(
      z.object({
        sourceId: z.string().min(1).max(40),
        aspectId: z.string().min(1).max(60),
        statement: z.string().min(3).max(240),
        quote: z.string().min(12).max(600),
      }),
    )
    .max(60),
});

export interface RawClaim {
  sourceId: string;
  aspectId: string;
  statement: string;
  quote: string;
}

const AUTHORITY_ORDER: Record<Authority, number> = {
  official: 0,
  secondary: 1,
  community: 2,
};

function authorityOf(source: SourceSnapshot): Authority {
  const domain = source.domain.toLowerCase();
  if (/\.(gov|gov\.[a-z]{2}|mil|nic\.in|gov\.uk|europa\.eu)$/.test(domain) || domain.endsWith(".gov")) {
    return "official";
  }
  if (domain.startsWith("docs.") || domain.startsWith("help.") || domain.startsWith("support.")) {
    return "official";
  }
  if (/^(reddit|quora|stackexchange|stackoverflow|medium|blogspot|wordpress|substack)\./.test(domain)) {
    return "community";
  }
  if (domain.includes("forum") || domain.includes("community") || domain.includes("discuss")) {
    return "community";
  }
  return "secondary";
}

export { authorityOf, AUTHORITY_ORDER };

export interface ClaimContextSource {
  snapshot: SourceSnapshot;
  authority: Authority;
  excerpt: string;
}

/**
 * Pick a bounded, aspect-relevant excerpt from each readable source.
 */
export function buildClaimContext(
  snapshots: SourceSnapshot[],
  aspects: PipelineAspect[],
  budget: { perSource?: number; total?: number } = {},
): ClaimContextSource[] {
  const perSource = budget.perSource ?? 9_000;
  const total = budget.total ?? 42_000;
  const queries = aspects.map((aspect) => `${aspect.label} ${aspect.keywords.join(" ")}`);

  const contexts = snapshots
    .filter((snapshot) => snapshot.status === "ok" && snapshot.text.length > 0)
    .map((snapshot) => ({
      snapshot,
      authority: authorityOf(snapshot),
      excerpt: selectContext(snapshot.text, queries, { maxChunks: 8, perAspect: 2 }).text.slice(
        0,
        perSource,
      ),
    }))
    .sort((a, b) => AUTHORITY_ORDER[a.authority] - AUTHORITY_ORDER[b.authority]);

  let used = 0;
  const kept: ClaimContextSource[] = [];
  for (const context of contexts) {
    if (used + context.excerpt.length > total && kept.length > 0) break;
    kept.push(context);
    used += context.excerpt.length;
  }
  return kept;
}

const CLAIM_SYSTEM = [
  "You audit a set of sources for one research question.",
  "Extract factual claims that a reader could check.",
  "Hard rules:",
  "1. Every claim must be supported by a quote copied character-for-character from that same source.",
  "2. Never paraphrase inside the quote, never merge two sentences, never fix spelling.",
  "3. The quote must be 8 to 45 words and must contain the specific fact, number or condition.",
  "4. If a source does not explicitly address an aspect, emit nothing for it.",
  "5. Ignore navigation, cookie notices, adverts, comments, related links and boilerplate.",
  "6. One claim per distinct fact. At most two claims per source per aspect.",
  "7. Prefer numbers, dates, named conditions and obligations over vague description.",
].join("\n");

export async function extractClaims(
  contexts: ClaimContextSource[],
  aspects: PipelineAspect[],
  question: string,
): Promise<RawClaim[]> {
  if (contexts.length === 0) return [];

  const aspectList = aspects
    .map(
      (aspect) =>
        `- ${aspect.id}: ${aspect.label}${aspect.keywords.length ? ` (search terms: ${aspect.keywords.join(", ")})` : ""}`,
    )
    .join("\n");

  const blocks = contexts
    .map(
      (context) =>
        `[SOURCE ${context.snapshot.id} | ${context.snapshot.domain} | ${context.authority} | ${
          context.snapshot.publishedAt?.slice(0, 10) ?? "no date"
        }]\n${context.excerpt}\n[/SOURCE ${context.snapshot.id}]`,
    )
    .join("\n\n");

  const reply = await generateJson({
    label: "claims",
    system: CLAIM_SYSTEM,
    prompt: [
      `Question: ${question}`,
      "",
      "Aspects (use these ids exactly):",
      aspectList,
      "",
      "Sources:",
      blocks,
      "",
      'Return JSON: { "claims": [ { "sourceId": string, "aspectId": string, "statement": string, "quote": string } ] }',
    ].join("\n"),
    schema: ClaimReply,
    temperature: 0.1,
    maxOutputTokens: 8000,
    timeoutMs: 90_000,
  });

  return reply.claims;
}

/* ------------------------------------------------------------- conflicts */

const ConflictReply = z.object({
  conflicts: z
    .array(
      z.object({
        aspectId: z.string().min(1).max(80),
        claimA: z.string().min(1).max(40),
        claimB: z.string().min(1).max(40),
        summary: z.string().min(5).max(240),
      }),
    )
    .max(8),
});

export interface ConflictCandidate {
  id: string;
  aspectId: string;
  domain: string;
  statement: string;
  quote: string;
}

export interface ModelConflict {
  aspectId: string;
  claimA: string;
  claimB: string;
  summary: string;
}

/**
 * Ask the model only about pairs of claims that already survived quote
 * verification. Deterministic value clashes are reported separately.
 */
export async function auditConflicts(candidates: ConflictCandidate[]): Promise<ModelConflict[]> {
  if (candidates.length < 2) return [];

  const lines = candidates
    .map(
      (candidate) =>
        `- id=${candidate.id} aspect=${candidate.aspectId} source=${candidate.domain}\n  claim: ${candidate.statement}\n  quote: "${candidate.quote.replace(/\s+/g, " ").slice(0, 320)}"`,
    )
    .join("\n");

  const reply = await generateJson({
    label: "conflicts",
    system: [
      "You compare verified claims for the same aspect and report only genuine contradictions.",
      "A contradiction means both claims cannot be true at the same time for the same thing.",
      "Different levels of detail, different examples, older rules superseded by dates, or complementary facts are NOT contradictions.",
      "Only compare claims that share the same aspectId and come from different sources.",
      "If nothing contradicts, return an empty list. Never invent a conflict to fill space.",
    ].join(" "),
    prompt: `Claims:\n${lines}\n\nReturn JSON: { "conflicts": [ { "aspectId": string, "claimA": string, "claimB": string, "summary": string } ] } using the claim ids exactly.`,
    schema: ConflictReply,
    temperature: 0.1,
    maxOutputTokens: 2000,
    timeoutMs: 45_000,
  });

  return reply.conflicts;
}
