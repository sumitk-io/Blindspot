import { NextResponse } from "next/server";
import { buildSnapshot, failedSnapshot, type SourceSnapshot } from "@/lib/snapshot";
import { analyze } from "@/lib/pipeline/analyze";
import { GeminiError } from "@/lib/gemini";
import { rateLimit } from "@/lib/rate-limit";
import type { FetchErrorCode } from "@/lib/safe-fetch";

export const maxDuration = 60;

interface SourceInput {
  url: string;
  failed?: { code: FetchErrorCode; message: string };
}

const MAX_SOURCES = 6;
const PER_IP_DISPLAY = 5;

function isFetchCode(value: unknown): value is FetchErrorCode {
  return (
    typeof value === "string" &&
    [
      "INVALID_URL",
      "UNSUPPORTED_SCHEME",
      "CREDENTIALS_IN_URL",
      "BLOCKED_PORT",
      "BLOCKED_HOST",
      "DNS_FAIL",
      "TIMEOUT",
      "HTTP_ERROR",
      "TOO_LARGE",
      "UNSUPPORTED_CONTENT_TYPE",
      "EMPTY_CONTENT",
      "REDIRECT_LOOP",
      "NETWORK_ERROR",
    ].includes(value)
  );
}

function parseSources(input: unknown): SourceInput[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const output: SourceInput[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);

    const failure = record.failed as Record<string, unknown> | undefined;
    const code = failure?.code;
    const message = failure?.message;

    output.push({
      url,
      failed:
        isFetchCode(code) && typeof message === "string"
          ? { code, message: message.slice(0, 200) }
          : undefined,
    });
  }

  return output.slice(0, MAX_SOURCES);
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "BAD_REQUEST", message: "Send a JSON body." },
      { status: 400 },
    );
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const sources = parseSources(body.sources);

  if (question.length < 8) {
    return NextResponse.json(
      { ok: false, code: "BAD_QUESTION", message: "Ask a question with at least a few words." },
      { status: 400 },
    );
  }
  if (question.length > 2000) {
    return NextResponse.json(
      { ok: false, code: "BAD_QUESTION", message: "That question is too long." },
      { status: 400 },
    );
  }
  if (sources.length === 0) {
    return NextResponse.json(
      { ok: false, code: "NO_SOURCES", message: "Add at least one source link." },
      { status: 400 },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip =
    forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "local";
  const limit = rateLimit(ip);

  if (!limit.allowed) {
    const minutes = Math.ceil(limit.retryAfterSeconds / 60);
    return NextResponse.json(
      {
        ok: false,
        code: limit.reason === "daily" ? "DAILY_LIMIT" : "RATE_LIMITED",
        message:
          limit.reason === "daily"
            ? "The shared demo quota for today is used up. The saved demo scenario still works."
            : `That is the live-analysis limit for now (${PER_IP_DISPLAY} runs an hour). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or load the demo scenario.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const snapshots: SourceSnapshot[] = await mapLimit(sources, 3, async (source) =>
    source.failed
      ? failedSnapshot(source.url, source.failed.code, source.failed.message)
      : buildSnapshot(source.url),
  );

  if (!snapshots.some((snapshot) => snapshot.status === "ok")) {
    return NextResponse.json(
      {
        ok: false,
        code: "NO_READABLE_SOURCES",
        message:
          "None of those sources could be read. Try a direct article link, or paste the text instead.",
      },
      { status: 422 },
    );
  }

  try {
    const result = await analyze({ question, sources: snapshots });
    return NextResponse.json(
      {
        ok: true,
        analysis: result.analysis,
        diagnostics: result.diagnostics,
      },
      { headers: { "X-RateLimit-Remaining": String(limit.remaining) } },
    );
  } catch (error) {
    if (error instanceof GeminiError) {
      const status =
        error.code === "NO_KEY"
          ? 503
          : error.code === "AUTH"
            ? 502
            : error.code === "QUOTA"
              ? 429
              : 502;
      const message =
        error.code === "NO_KEY"
          ? "Live analysis is not configured yet. Add GEMINI_API_KEY to .env.local, or load the demo scenario."
          : error.code === "AUTH"
            ? "The Gemini API key on the server was rejected."
            : error.code === "QUOTA"
              ? "The analysis quota is used up for now. Try again shortly, or load the demo scenario."
              : "The analyzer could not finish this run. Try again with fewer sources.";
      return NextResponse.json({ ok: false, code: error.code, message }, { status });
    }

    return NextResponse.json(
      {
        ok: false,
        code: "ANALYSIS_FAILED",
        message: "The analyzer hit an unexpected problem.",
      },
      { status: 500 },
    );
  }
}
