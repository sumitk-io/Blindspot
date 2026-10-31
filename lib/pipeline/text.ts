/**
 * Text utilities shared by the pipeline: chunking, retrieval scoring,
 * quote verification and typed-value extraction.
 *
 * Quote verification is the trust anchor of the product: a claim only counts
 * if its quote can be located in the frozen source text, allowing for the
 * typographic and whitespace differences that real pages contain.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "will", "shall", "have", "has", "had", "not", "but", "you", "your", "our",
  "their", "they", "them", "its", "his", "her", "can", "may", "must", "any",
  "all", "each", "which", "who", "whom", "what", "when", "where", "how",
  "into", "onto", "than", "then", "there", "these", "those", "been", "being",
  "如", "的", "了", "和",
]);

export function tokenize(input: string): string[] {
  const matches = input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return matches.filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/* ------------------------------------------------------------------ chunks */

export interface Chunk {
  index: number;
  start: number;
  end: number;
  text: string;
}

interface Sentence {
  start: number;
  end: number;
}

function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  const pattern = /[^.!?\n]+[.!?]*/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[0];
    if (!raw.trim()) continue;
    const leading = raw.length - raw.trimStart().length;
    const start = match.index + leading;
    const end = match.index + raw.trimEnd().length;
    if (end > start) sentences.push({ start, end });
  }
  return sentences;
}

/** Split long text into overlapping chunks that respect sentence boundaries. */
export function chunkText(text: string, maxChars = 1200, overlapChars = 200): Chunk[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];

  const chunks: Chunk[] = [];
  let cursor = 0;

  while (cursor < sentences.length) {
    let end = cursor;
    const startOffset = sentences[cursor].start;
    while (
      end < sentences.length &&
      sentences[end].end - startOffset <= maxChars
    ) {
      end += 1;
    }
    if (end === cursor) end = cursor + 1;

    let last = end - 1;
    while (last > cursor && /[\s,;:-]$/.test(text.slice(sentences[last].end - 1, sentences[last].end))) {
      last -= 1;
    }

    chunks.push({
      index: chunks.length,
      start: startOffset,
      end: sentences[last].end,
      text: text.slice(startOffset, sentences[last].end),
    });

    if (end >= sentences.length) break;

    // Rewind so the next chunk overlaps a little with this one.
    let next = end;
    const overlapStart = sentences[last].end - overlapChars;
    while (next > cursor && sentences[next - 1].start >= overlapStart) next -= 1;
    cursor = next > cursor ? next : cursor + 1;
  }

  return chunks;
}

function chunkScore(chunk: Chunk, queryTokens: Set<string>): number {
  const tokens = tokenize(chunk.text);
  if (tokens.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);

  let score = 0;
  for (const token of queryTokens) {
    const count = counts.get(token);
    if (!count) continue;
    const weight = token.length >= 7 ? 1.6 : token.length >= 5 ? 1.2 : 0.8;
    score += (1 + Math.log(count)) * weight;
  }
  return score / Math.sqrt(tokens.length);
}

export interface ContextSelection {
  text: string;
  chunkIndexes: number[];
}

/**
 * Build a bounded, relevance-weighted excerpt of a source for one prompt:
 * the opening chunks plus the best chunks for each aspect.
 */
export function selectContext(
  text: string,
  aspectQueries: string[],
  options: { maxChunks?: number; perAspect?: number } = {},
): ContextSelection {
  const maxChunks = options.maxChunks ?? 10;
  const perAspect = options.perAspect ?? 2;
  const chunks = chunkText(text);
  if (chunks.length === 0) return { text: "", chunkIndexes: [] };

  const chosen = new Set<number>();
  for (const index of [0, 1]) if (index < chunks.length) chosen.add(index);

  for (const query of aspectQueries) {
    const queryTokens = new Set(tokenize(query));
    if (queryTokens.size === 0) continue;
    const ranked = chunks
      .map((chunk) => ({ index: chunk.index, score: chunkScore(chunk, queryTokens) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, perAspect);
    for (const entry of ranked) chosen.add(entry.index);
  }

  const ordered = [...chosen].sort((a, b) => a - b).slice(0, maxChunks);
  const body = ordered
    .map((index) => chunks[index].text)
    .join("\n\n[...]\n\n");

  return { text: body, chunkIndexes: ordered };
}

/* --------------------------------------------------------- quote checking */

function foldChar(ch: string): string {
  return ch
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B\u2032\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u2026/g, "...");
}

interface Folded {
  text: string;
  map: number[];
}

/** Lowercase, NFKC-fold, unify quotes/dashes and collapse whitespace, keeping offsets. */
export function foldWithMap(input: string): Folded {
  const out: string[] = [];
  const map: number[] = [];
  let previousSpace = false;

  for (let i = 0; i < input.length; i += 1) {
    const folded = foldChar(input[i]);
    for (const ch of folded) {
      if (/\s/.test(ch)) {
        if (previousSpace) continue;
        out.push(" ");
        map.push(i);
        previousSpace = true;
        continue;
      }
      const lower = ch.toLowerCase();
      for (const piece of lower) {
        out.push(piece);
        map.push(i);
      }
      previousSpace = false;
    }
  }

  return { text: out.join(""), map };
}

export type QuoteMethod = "exact" | "folded" | "fuzzy" | "none";

export interface QuoteCheck {
  verified: boolean;
  method: QuoteMethod;
  matched: string | null;
  start: number;
  end: number;
  score: number;
}

const MIN_QUOTE_CHARS = 24;

interface TokenSpan {
  token: string;
  start: number;
  end: number;
}

function tokenSpans(input: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const pattern = /[\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    spans.push({ token: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/**
 * Locate `quote` inside `text`. Returns the exact span found in the source so
 * the UI can show what was actually written, not what the model paraphrased.
 */
export function verifyQuote(text: string, quote: string): QuoteCheck {
  const candidate = quote.trim().replace(/^["'\u201C\u201D]+|["'\u201C\u201D]+$/g, "").trim();
  if (!text || candidate.length < MIN_QUOTE_CHARS) {
    return { verified: false, method: "none", matched: null, start: -1, end: -1, score: 0 };
  }

  const direct = text.indexOf(candidate);
  if (direct !== -1) {
    return {
      verified: true,
      method: "exact",
      matched: text.slice(direct, direct + candidate.length),
      start: direct,
      end: direct + candidate.length,
      score: 1,
    };
  }

  const foldedText = foldWithMap(text);
  const foldedQuote = foldWithMap(candidate).text.trim();
  const foldedIndex = foldedText.text.indexOf(foldedQuote);
  if (foldedIndex !== -1 && foldedQuote.length >= MIN_QUOTE_CHARS) {
    const start = foldedText.map[foldedIndex];
    const end = foldedText.map[foldedIndex + foldedQuote.length - 1] + 1;
    return {
      verified: true,
      method: "folded",
      matched: text.slice(start, end),
      start,
      end,
      score: 1,
    };
  }

  // Fuzzy: allow the model to drop or add a word, but require 90% token overlap.
  const quoteTokens = tokenSpans(candidate).map((span) => span.token);
  if (quoteTokens.length < 6) {
    return { verified: false, method: "none", matched: null, start: -1, end: -1, score: 0 };
  }
  const spans = tokenSpans(text);
  if (spans.length < quoteTokens.length) {
    return { verified: false, method: "none", matched: null, start: -1, end: -1, score: 0 };
  }

  const wanted = new Map<string, number>();
  for (const token of quoteTokens) wanted.set(token, (wanted.get(token) ?? 0) + 1);

  // Allow the model to drop a word: the window may be slightly longer than the
  // quote, but the score is measured against the quote, so invented words hurt.
  const windowSize = quoteTokens.length + 4;
  let best = { score: 0, index: -1, last: -1 };
  let tried = 0;

  for (let i = 0; i < spans.length && tried < 400; i += 1) {
    if (spans[i].token !== quoteTokens[0]) continue;
    tried += 1;
    if (i + quoteTokens.length > spans.length) break;

    const limit = Math.min(spans.length - i, windowSize);
    const seen = new Map<string, number>();
    let hits = 0;
    let last = i;

    for (let j = 0; j < limit; j += 1) {
      const token = spans[i + j].token;
      const remaining = (wanted.get(token) ?? 0) - (seen.get(token) ?? 0);
      if (remaining > 0) {
        seen.set(token, (seen.get(token) ?? 0) + 1);
        hits += 1;
        last = i + j;
      }
    }

    const score = hits / quoteTokens.length;
    if (score > best.score) best = { score, index: i, last };
    if (score === 1) break;
  }

  if (best.index === -1 || best.score < 0.9) {
    return { verified: false, method: "none", matched: null, start: -1, end: -1, score: best.score };
  }

  const start = spans[best.index].start;
  const end = spans[best.last].end;
  return {
    verified: true,
    method: "fuzzy",
    matched: text.slice(start, end),
    start,
    end,
    score: best.score,
  };
}

/* ----------------------------------------------------------- typed values */

export type ValueKind = "percent" | "money" | "date" | "duration";

export interface TypedValue {
  kind: ValueKind;
  raw: string;
  normalized: string;
  number: number | null;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1990 || year > 2100) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

const UNIT_DAYS: Record<string, number> = {
  day: 1, week: 7, month: 30, year: 365,
};

/** Pull comparable facts (numbers, money, dates, durations) out of a quote. */
export function extractValues(input: string): TypedValue[] {
  const values: TypedValue[] = [];
  const seen = new Set<string>();

  const push = (value: TypedValue) => {
    const key = `${value.kind}:${value.normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  };

  for (const match of input.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent)/gi)) {
    const number = Number(match[1]);
    push({ kind: "percent", raw: match[0], normalized: `${number}%`, number });
  }

  for (const match of input.matchAll(/(?:[$€£₹]|\b(?:rs\.?|inr|usd|eur|gbp)\b)\s*(\d[\d,]*(?:\.\d+)?)/gi)) {
    const number = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(number)) continue;
    push({ kind: "money", raw: match[0], normalized: `amount:${number}`, number });
  }

  for (const match of input.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = isoDate(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) push({ kind: "date", raw: match[0], normalized: iso, number: null });
  }

  for (const match of input.matchAll(
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?,?\s+(\d{4})\b/gi,
  )) {
    const iso = isoDate(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
    if (iso) push({ kind: "date", raw: match[0], normalized: iso, number: null });
  }

  for (const match of input.matchAll(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  )) {
    const iso = isoDate(Number(match[3]), MONTHS[match[1].toLowerCase()], Number(match[2]));
    if (iso) push({ kind: "date", raw: match[0], normalized: iso, number: null });
  }

  for (const match of input.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g)) {
    const iso = isoDate(Number(match[3]), Number(match[2]), Number(match[1]));
    if (iso) push({ kind: "date", raw: match[0], normalized: iso, number: null });
  }

  for (const match of input.matchAll(/\b(\d+(?:\.\d+)?)\s*(day|week|month|year)s?\b/gi)) {
    const unit = match[2].toLowerCase();
    const number = Number(match[1]);
    push({
      kind: "duration",
      raw: match[0],
      normalized: `${Math.round(number * UNIT_DAYS[unit])}d`,
      number: number * UNIT_DAYS[unit],
    });
  }

  return values;
}
