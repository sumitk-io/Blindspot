import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export type DateConfidence = "high" | "medium" | "low" | "none";

export interface Extracted {
  title: string;
  text: string;
  siteName: string | null;
  byline: string | null;
  publishedAt: string | null;
  dateConfidence: DateConfidence;
}

const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;
const NBSP_LIKE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g;

/** One normalisation pass. Offsets are always computed against this output. */
export function normalizeText(input: string): string {
  return input
    .replace(ZERO_WIDTH, "")
    .replace(/\r\n?/g, "\n")
    .replace(NBSP_LIKE, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return parsed.toISOString();
}

function metaContent(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute("content");
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function jsonLdDates(doc: Document): { published: string | null; modified: string | null } {
  let published: string | null = null;
  let modified: string | null = null;

  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;

      if (Array.isArray(record["@graph"])) queue.push(...record["@graph"]);

      if (!published && typeof record.datePublished === "string") {
        published = toIso(record.datePublished);
      }
      if (!modified && typeof record.dateModified === "string") {
        modified = toIso(record.dateModified);
      }
    }
  }

  return { published, modified };
}

function visibleDate(text: string): string | null {
  const sample = text.slice(0, 6000);
  const pattern =
    /(?:last\s+updated|last\s+revised|updated|published|posted)\s*(?:on|:)?\s*([A-Z][a-z]{2,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Z][a-z]{2,9}\s+\d{4}|\d{4}-\d{2}-\d{2})/i;
  const match = pattern.exec(sample);
  return match ? toIso(match[1]) : null;
}

/**
 * Extract main article text and the most trustworthy publish date available.
 * Confidence reflects the source of the date, not how recent it is.
 */
export function extractFromHtml(
  html: string,
  url: string,
  lastModifiedHeader: string | null = null,
): Extracted {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const title =
    metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
    doc.title?.trim() ??
    "";
  const siteName = metaContent(doc, ['meta[property="og:site_name"]']);
  const byline = metaContent(doc, ['meta[name="author"]', 'meta[property="article:author"]']);

  const ld = jsonLdDates(doc);
  const metaPublished = toIso(
    metaContent(doc, [
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="pubdate"]',
      'meta[name="publish-date"]',
    ]),
  );
  const metaModified = toIso(
    metaContent(doc, [
      'meta[property="article:modified_time"]',
      'meta[property="og:updated_time"]',
      'meta[name="last-modified"]',
    ]),
  );
  const timeElement = toIso(doc.querySelector("time[datetime]")?.getAttribute("datetime"));

  // Remove non-content nodes before text extraction.
  doc
    .querySelectorAll("script,style,noscript,template,svg,canvas,iframe")
    .forEach((node) => node.remove());

  let bodyText = "";
  try {
    const reader = new Readability(doc, { charThreshold: 200 });
    const article = reader.parse();
    bodyText = article?.textContent ?? "";
  } catch {
    bodyText = "";
  }

  if (bodyText.trim().length < 300) {
    bodyText = doc.body?.textContent ?? bodyText;
  }

  const text = normalizeText(bodyText);

  let publishedAt: string | null = null;
  let dateConfidence: DateConfidence = "none";

  const candidates: [string | null, DateConfidence][] = [
    [ld.published ?? ld.modified, "high"],
    [metaPublished ?? metaModified, "high"],
    [timeElement, "medium"],
    [visibleDate(text), "low"],
  ];

  for (const [value, confidence] of candidates) {
    if (value) {
      publishedAt = value;
      dateConfidence = confidence;
      break;
    }
  }

  return {
    title: normalizeText(title) || url,
    text,
    siteName,
    byline,
    publishedAt,
    dateConfidence,
  };
}
