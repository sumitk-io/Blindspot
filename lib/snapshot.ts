import { createHash, randomUUID } from "node:crypto";
import { extractFromHtml, normalizeText, type DateConfidence } from "./extract";
import { FetchError, safeFetch, type FetchErrorCode } from "./safe-fetch";

export interface SourceSnapshot {
  id: string;
  url: string;
  finalUrl: string;
  domain: string;
  title: string;
  siteName: string | null;
  text: string;
  sha256: string;
  fetchedAt: string;
  publishedAt: string | null;
  dateConfidence: DateConfidence;
  updatedAt: string | null;
  contentType: string;
  bytes: number;
  truncated: boolean;
  status: "ok" | "failed";
  errorCode?: FetchErrorCode;
  errorMessage?: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Say why a page produced nothing usable. "Needs JavaScript" is the wrong
 * diagnosis for a perfectly readable stub, and that mislabel is what made every
 * link failure look identical.
 */
function emptyContentMessage(extractedText: string, rawBody: string): string {
  const words = extractedText.split(/\s+/).filter(Boolean).length;

  if (words === 0) {
    return rawBody.trim().length > 0
      ? "This page builds its content with JavaScript, so the text is not in the HTML. Open it in a browser and paste the text instead."
      : "The source returned an empty document.";
  }
  if (words < 40) {
    return `This page has only ${words} words of readable text — it looks like a placeholder, a link index or a stub, so there is nothing to audit.`;
  }
  return `Only ${words} words of readable text could be extracted, which is too little to audit.`;
}

/**
 * Build a failed snapshot for a source we already know cannot be read.
 * Keeps the matrix honest without retrying a dead link.
 */
export function failedSnapshot(
  rawUrl: string,
  code: FetchErrorCode,
  message: string,
): SourceSnapshot {
  return {
    id: randomUUID(),
    url: rawUrl,
    finalUrl: rawUrl,
    domain: domainOf(rawUrl),
    title: domainOf(rawUrl),
    siteName: null,
    text: "",
    sha256: "",
    fetchedAt: new Date().toISOString(),
    publishedAt: null,
    dateConfidence: "none",
    updatedAt: null,
    contentType: "",
    bytes: 0,
    truncated: false,
    status: "failed",
    errorCode: code,
    errorMessage: message,
  };
}

/**
 * Freeze text the user pasted, for pages that block automated fetching.
 * Same shape as a fetched snapshot so the rest of the pipeline cannot tell
 * the difference.
 */
export function snapshotFromText(text: string, label: string): SourceSnapshot {
  const id = randomUUID();
  const cleaned = normalizeText(text);
  const name = label.trim() || "Pasted text";
  const ok = cleaned.length >= 300;

  return {
    id,
    url: "pasted-text",
    finalUrl: "pasted-text",
    domain: name.slice(0, 48),
    title: name.slice(0, 120),
    siteName: null,
    text: cleaned,
    sha256: createHash("sha256").update(cleaned).digest("hex"),
    fetchedAt: new Date().toISOString(),
    publishedAt: null,
    dateConfidence: "none",
    updatedAt: null,
    contentType: "text/plain",
    bytes: Buffer.byteLength(cleaned, "utf8"),
    truncated: false,
    status: ok ? "ok" : "failed",
    errorCode: ok ? undefined : "EMPTY_CONTENT",
    errorMessage: ok
      ? undefined
      : "Pasted text is too short to audit. Paste at least a few paragraphs.",
  };
}

/**
 * Fetch a URL and freeze everything a finding might later point at:
 * cleaned text, content hash, fetch time and the best available date.
 * Never throws: a failed source is returned with a status and a reason.
 */
export async function buildSnapshot(rawUrl: string): Promise<SourceSnapshot> {
  const startedAt = Date.now();
  const snapshot = await buildSnapshotInner(rawUrl);
  const words = snapshot.text ? snapshot.text.split(/\s+/).filter(Boolean).length : 0;
  const event = {
    event: snapshot.status === "ok" ? "snapshot_ok" : "snapshot_failed",
    domain: snapshot.domain,
    status: snapshot.status,
    code: snapshot.errorCode,
    words,
    elapsedMs: Date.now() - startedAt,
    message: snapshot.errorMessage,
  };

  if (snapshot.status !== "ok") {
    console.warn(`[blindspot:snapshot] ${JSON.stringify(event)}`);
  } else if (words < 200 || event.elapsedMs > 3_000) {
    console.info(`[blindspot:snapshot] ${JSON.stringify(event)}`);
  }

  return snapshot;
}

async function buildSnapshotInner(rawUrl: string): Promise<SourceSnapshot> {
  const id = randomUUID();
  const fetchedAt = new Date().toISOString();

  try {
    const fetched = await safeFetch(rawUrl);
    const finalUrl = fetched.finalUrl;

    const isPlain = fetched.contentType === "text/plain" || fetched.contentType === "text/markdown";

    const extracted = isPlain
      ? {
          title: domainOf(finalUrl),
          text: normalizeText(fetched.text),
          siteName: null,
          byline: null,
          publishedAt: null,
          dateConfidence: "none" as DateConfidence,
          updatedAt: null,
          updatedConfidence: "none" as DateConfidence,
        }
      : extractFromHtml(fetched.text, finalUrl, fetched.lastModified);

    // A short page is still a readable page. Only reject it when there is too
    // little text to audit, so a link index or a cookie wall is not treated the
    // same as a valid but brief document.
    const words = extracted.text.split(/\s+/).filter(Boolean).length;
    const readableEnough =
      extracted.text.length >= 300 || (words >= 15 && extracted.text.length >= 120);

    if (!readableEnough) {
      return {
        id,
        url: rawUrl,
        finalUrl,
        domain: domainOf(finalUrl),
        title: extracted.title,
        siteName: extracted.siteName,
        text: extracted.text,
        sha256: createHash("sha256").update(extracted.text).digest("hex"),
        fetchedAt,
        publishedAt: extracted.publishedAt,
        dateConfidence: extracted.dateConfidence,
        updatedAt: extracted.updatedAt,
        contentType: fetched.contentType,
        bytes: fetched.bytes,
        truncated: fetched.truncated,
        status: "failed",
        errorCode: "EMPTY_CONTENT",
        errorMessage: emptyContentMessage(extracted.text, fetched.text),
      };
    }

    return {
      id,
      url: rawUrl,
      finalUrl,
      domain: domainOf(finalUrl),
      title: extracted.title,
      siteName: extracted.siteName,
      text: extracted.text,
      sha256: createHash("sha256").update(extracted.text).digest("hex"),
      fetchedAt,
      publishedAt: extracted.publishedAt,
      dateConfidence: extracted.dateConfidence,
      updatedAt: extracted.updatedAt,
      contentType: fetched.contentType,
      bytes: fetched.bytes,
      truncated: fetched.truncated,
      status: "ok",
    };
  } catch (error) {
    if (error instanceof FetchError) {
      return {
        id,
        url: rawUrl,
        finalUrl: rawUrl,
        domain: domainOf(rawUrl),
        title: domainOf(rawUrl),
        siteName: null,
        text: "",
        sha256: "",
        fetchedAt,
        publishedAt: null,
        dateConfidence: "none",
        updatedAt: null,
        contentType: "",
        bytes: 0,
        truncated: false,
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
      };
    }

    return {
      id,
      url: rawUrl,
      finalUrl: rawUrl,
      domain: domainOf(rawUrl),
      title: domainOf(rawUrl),
      siteName: null,
      text: "",
      sha256: "",
      fetchedAt,
      publishedAt: null,
      dateConfidence: "none",
      updatedAt: null,
      contentType: "",
      bytes: 0,
      truncated: false,
      status: "failed",
      errorCode: "NETWORK_ERROR",
      errorMessage: "The source could not be read.",
    };
  }
}
