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
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;

const USER_AGENT =
  "BlindspotBot/1.0 (source auditor; +https://github.com/sumitk-io/Blindspot)";

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
 */
export async function safeFetch(
  raw: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<FetchedSource> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let current = await assertPublicUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new FetchError("TIMEOUT", "The source took too long to respond.");
      }
      throw new FetchError("NETWORK_ERROR", "Could not connect to this source.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchError("HTTP_ERROR", "The source returned an invalid redirect.");
      }
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) {
      throw new FetchError("HTTP_ERROR", `The source returned HTTP ${response.status}.`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    const baseType = contentType.split(";")[0].trim();
    if (baseType && !ALLOWED_CONTENT.includes(baseType)) {
      throw new FetchError(
        "UNSUPPORTED_CONTENT_TYPE",
        `This content type cannot be read (${baseType}).`,
      );
    }

    const { bytes, truncated } = await readCapped(response, maxBytes);
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

  throw new FetchError("REDIRECT_LOOP", "Too many redirects.");
}
