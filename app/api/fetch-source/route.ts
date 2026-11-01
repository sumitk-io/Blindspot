import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/snapshot";

export const maxDuration = 30;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_URL", message: "Send a JSON body with a url field." },
      { status: 400 },
    );
  }

  const candidate = (payload as { url?: unknown } | null)?.url;
  const url = typeof candidate === "string" ? candidate.trim() : "";

  if (!url) {
    return NextResponse.json(
      { ok: false, code: "INVALID_URL", message: "A url is required." },
      { status: 400 },
    );
  }

  if (url.length > 2048) {
    return NextResponse.json(
      { ok: false, code: "INVALID_URL", message: "That link is too long." },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  const snapshot = await buildSnapshot(url);
  const wordCount = snapshot.text ? snapshot.text.split(/\s+/).filter(Boolean).length : 0;

  // The full text stays server-side; the client only needs the preview.
  const { text: _text, ...preview } = snapshot;

  return NextResponse.json({
    ok: snapshot.status === "ok",
    durationMs: Date.now() - startedAt,
    snapshot: { ...preview, wordCount },
  });
}
