import dns from "node:dns/promises";
import net from "node:net";

export type FetchErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "CREDENTIALS_IN_URL"
  | "BLOCKED_PORT"
  | "BLOCKED_HOST"
  | "DNS_FAIL"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "TOO_LARGE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "EMPTY_CONTENT"
  | "REDIRECT_LOOP"
  | "NETWORK_ERROR";

export class FetchError extends Error {
  readonly code: FetchErrorCode;

  constructor(code: FetchErrorCode, message?: string) {
    super(message ?? code);
    this.name = "FetchError";
    this.code = code;
  }
}

const blocked = new net.BlockList();
// IPv4 ranges that must never be fetched from a server.
blocked.addSubnet("0.0.0.0", 8, "ipv4");
blocked.addSubnet("10.0.0.0", 8, "ipv4");
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // carrier-grade NAT
blocked.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local, cloud metadata
blocked.addSubnet("172.16.0.0", 12, "ipv4");
blocked.addSubnet("192.0.0.0", 24, "ipv4");
blocked.addSubnet("192.168.0.0", 16, "ipv4");
blocked.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blocked.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blocked.addSubnet("240.0.0.0", 4, "ipv4"); // reserved

// IPv6 equivalents.
blocked.addAddress("::1", "ipv6");
blocked.addAddress("::", "ipv6");
blocked.addSubnet("fc00::", 7, "ipv6"); // unique local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const ALLOWED_CONTENT = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
];

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 12_000;
/** Hard ceiling for one logical fetch, including every redirect hop. */
const DEFAULT_BUDGET_MS = 24_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Only these are worth a second attempt; a contended timeout should not be retried. */
const RETRYABLE = new Set<FetchErrorCode>(["NETWORK_ERROR"]);
/** A socket that closed mid-handshake is transient; a connect timeout is not. */
const TRANSIENT_DETAIL = /(socket|econnreset|epipe|other side closed)/i;
const SLOW_FETCH_MS = 3_000;

const USER_AGENT =
  "BlindspotBot/1.0 (source auditor; +https://github.com/sumitk-io/Blindspot)";

/**
 * Server-side trace for link ingestion. Every failure carries the URL, the
 * redirect hop, the status and the elapsed time, so a "could not load" report
 * can be traced to one cause instead of guessing.
 */
function logFetch(level: "info" | "warn", event: Record<string, unknown>) {
  const line = `[blindspot:fetch] ${JSON.stringify(event)}`;
  if (level === "warn") console.warn(line);
  else console.info(line);
}

function httpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return `This site blocks automated reading (HTTP ${status}). Open it in a browser and paste the text instead.`;
  }
  if (status === 404 || status === 410) {
    return `This page no longer exists (HTTP ${status}). Check the link.`;
  }
  if (status === 429) {
    return "This site is rate-limiting requests (HTTP 429). Wait a minute and try again.";
  }
  if (status >= 500) {
    return `The site returned a server error (HTTP ${status}). Try again later.`;
  }
  return `The source returned HTTP ${status}.`;
}

const PDF_MESSAGE =
  "PDF files cannot be read yet. Open the file and paste its text instead.";

function isPdfMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export interface FetchedSource {
  text: string;
  finalUrl: string;
  contentType: string;
  charset: string;
  status: number;
  bytes: number;
  truncated: boolean;
  lastModified: string | null;
}

/** Validates a URL and resolves it to a public address. Throws FetchError otherwise. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new FetchError("INVALID_URL", "This does not look like a valid link.");
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new FetchError("UNSUPPORTED_SCHEME", "Only http and https links are supported.");
  }
  if (url.username || url.password) {
    throw new FetchError("CREDENTIALS_IN_URL", "Links with a username or password are not allowed.");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new FetchError("BLOCKED_PORT", "This port is not allowed.");
  }
  if (!url.hostname) {
    throw new FetchError("INVALID_URL", "This link has no hostname.");
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new FetchError("DNS_FAIL", "Could not find this website.");
  }

  if (addresses.length === 0) {
    throw new FetchError("DNS_FAIL", "Could not find this website.");
  }

  for (const entry of addresses) {
    const mapped = entry.address.startsWith("::ffff:")
      ? entry.address.slice("::ffff:".length)
      : entry.address;
    const family = net.isIPv4(mapped) ? "ipv4" : "ipv6";
    if (blocked.check(mapped, family)) {
      throw new FetchError("BLOCKED_HOST", "This address cannot be fetched for security reasons.");
    }
  }

  return url;
}

function charsetFromContentType(contentType: string): string | null {
  const match = /charset=["']?([\w-]+)/i.exec(contentType);
  return match ? match[1].toLowerCase() : null;
}

function charsetFromBody(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 2048)).toString("latin1");
  const match = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return match ? match[1].toLowerCase() : null;
}

function decodeBody(bytes: Uint8Array, charset: string) {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = response.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(), truncated: false };

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    if (received + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, Math.max(0, maxBytes - received)));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }

    received += value.byteLength;
    chunks.push(value);
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { bytes, truncated };
}

/**
 * Fetch a user-supplied URL under guard: public addresses only, limited redirects,
 * bounded time and size, and a narrow content-type allowlist.
 *
 * The timeout is a per-attempt socket timeout; `budgetMs` caps the whole chain so
 * a redirect loop or a slow host can never hold a request open indefinitely.
 */
export async function safeFetch(
  raw: string,
  options: { maxBytes?: number; timeoutMs?: number; budgetMs?: number } = {},
): Promise<FetchedSource> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;

  let current = await assertPublicUrl(raw);
  const visited = new Set<string>([current.toString()]);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining < 750) {
      logFetch("warn", {
        event: "budget_exhausted",
        url: raw,
        hop,
        elapsedMs: Date.now() - startedAt,
        budgetMs,
      });
      throw new FetchError(
        "TIMEOUT",
        `Reading this source took longer than ${Math.round(budgetMs / 1000)} seconds. Try again, or paste the text instead.`,
      );
    }

    const attemptTimeout = Math.min(timeoutMs, remaining);
    let response: Response | null = null;
    let lastError: FetchError | null = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const hopStarted = Date.now();
      try {
        response = await fetch(current, {
          redirect: "manual",
          signal: AbortSignal.timeout(attemptTimeout),
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
          },
        });
        break;
      } catch (error) {
        const isTimeout = error instanceof Error && error.name === "TimeoutError";
        const name = error instanceof Error ? error.name : "UnknownError";
        const cause = (error as { cause?: { code?: string; message?: string } }).cause;
        const detail = cause?.code ?? cause?.message ?? name;

        logFetch("warn", {
          event: isTimeout ? "hop_timeout" : "hop_error",
          url: current.toString(),
          hop,
          attempt: attempt + 1,
          elapsedMs: Date.now() - hopStarted,
          timeoutMs: attemptTimeout,
          detail,
        });

        lastError = isTimeout
          ? new FetchError(
              "TIMEOUT",
              "The source did not respond in time. It may be slow, or it may be blocking automated readers.",
            )
          : new FetchError("NETWORK_ERROR", `Could not connect to this source (${detail}).`);

        // A dropped socket is worth one retry; a connect timeout is not, because
        // retrying it only doubles the wait for a host that is already unreachable.
        const canRetry =
          RETRYABLE.has(lastError.code) &&
          TRANSIENT_DETAIL.test(detail) &&
          attempt === 0 &&
          deadline - Date.now() > 1_500;
        if (!canRetry) break;
        await sleep(250);
      }
    }

    if (!response) {
      throw lastError ?? new FetchError("NETWORK_ERROR", "Could not connect to this source.");
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchError("HTTP_ERROR", "The source returned a redirect without a destination.");
      }

      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new FetchError("HTTP_ERROR", "The source returned an invalid redirect.");
      }

      const nextUrl = next.toString();
      if (visited.has(nextUrl)) {
        logFetch("warn", {
          event: "redirect_loop",
          url: raw,
          hop,
          target: nextUrl,
          elapsedMs: Date.now() - startedAt,
        });
        throw new FetchError("REDIRECT_LOOP", "This link redirects in a loop.");
      }
      visited.add(nextUrl);

      // Re-validate every hop so a redirect cannot reach an internal address.
      current = await assertPublicUrl(nextUrl);
      continue;
    }

    if (!response.ok) {
      logFetch("warn", {
        event: "http_error",
        url: current.toString(),
        hop,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      });
      throw new FetchError("HTTP_ERROR", httpErrorMessage(response.status));
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const baseType = contentType.split(";")[0].trim();

    if (baseType === "application/pdf") {
      logFetch("warn", { event: "pdf_rejected", url: current.toString(), baseType });
      throw new FetchError("UNSUPPORTED_CONTENT_TYPE", PDF_MESSAGE);
    }

    if (baseType && baseType !== "application/octet-stream" && !ALLOWED_CONTENT.includes(baseType)) {
      logFetch("warn", { event: "content_type_rejected", url: current.toString(), baseType });
      throw new FetchError("UNSUPPORTED_CONTENT_TYPE", `This content type cannot be read (${baseType}).`);
    }

    const { bytes, truncated } = await readCapped(response, maxBytes);

    // Some servers serve a PDF as application/octet-stream; check the signature.
    if (isPdfMagic(bytes)) {
      logFetch("warn", { event: "pdf_magic_rejected", url: current.toString(), baseType });
      throw new FetchError("UNSUPPORTED_CONTENT_TYPE", PDF_MESSAGE);
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > SLOW_FETCH_MS) {
      logFetch("info", {
        event: "slow_fetch",
        url: current.toString(),
        elapsedMs,
        bytes: bytes.byteLength,
      });
    }

    const charset =
      charsetFromContentType(contentType) ?? charsetFromBody(bytes) ?? "utf-8";

    return {
      text: decodeBody(bytes, charset),
      finalUrl: current.toString(),
      contentType: baseType || "text/html",
      charset,
      status: response.status,
      bytes: bytes.byteLength,
      truncated,
      lastModified: response.headers.get("last-modified"),
    };
  }

  logFetch("warn", { event: "too_many_redirects", url: raw, elapsedMs: Date.now() - startedAt });
  throw new FetchError("REDIRECT_LOOP", "Too many redirects.");
}
