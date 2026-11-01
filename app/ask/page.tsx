"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  ClipboardPaste,
  FileText,
  Info,
  Link2,
  LoaderCircle,
  Plus,
  RotateCcw,
  Search,
  Shield,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";
import AspectStrip from "@/components/aspect-strip";
import { aspects } from "@/lib/demo";
import type { Authority } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DraftSource {
  id: string;
  domain: string;
  url: string;
  kind: "url" | "text";
  text?: string;
  authority: Authority;
  status: "checking" | "ok" | "failed";
  code?: string;
  note?: string;
  title?: string;
}

interface ExamplePreset {
  id: string;
  title: string;
  question: string;
  sources: { domain: string; url: string }[];
}

const examples: ExamplePreset[] = [
  {
    id: "government-scholarships",
    title: "Government scholarships",
    question:
      "What should students verify before applying for a government scholarship? Check eligibility, income limits, documents, deadlines and renewal rules.",
    sources: [
      { domain: "scholarships.gov.in", url: "https://scholarships.gov.in/" },
      { domain: "aicte-india.org", url: "https://www.aicte-india.org/" },
    ],
  },
  {
    id: "college-admissions",
    title: "College admissions",
    question:
      "What should students verify before participating in JoSAA counselling? Check eligibility, seat allocation, choice filling, fees and withdrawal rules.",
    sources: [
      { domain: "josaa.nic.in", url: "https://josaa.nic.in/" },
      { domain: "jeeadv.ac.in", url: "https://jeeadv.ac.in/" },
    ],
  },
  {
    id: "consumer-rights",
    title: "Consumer rights",
    question:
      "What can a student do if an online shopping platform refuses a refund for a defective product? Check consumer rights, return policies and complaint procedures.",
    sources: [
      { domain: "consumerhelpline.gov.in", url: "https://consumerhelpline.gov.in/" },
      { domain: "consumeraffairs.nic.in", url: "https://consumeraffairs.nic.in/" },
    ],
  },
];

const SUGGESTED_QUESTION =
  "e.g. What should students verify before applying for a government scholarship?";

/**
 * Failures worth offering the paste fallback for: the site blocked us, timed out,
 * served nothing readable, or the link is broken. Validation and security stops
 * are excluded, because pasting would not help.
 */
const BLOCKING_CODES = new Set([
  "HTTP_ERROR",
  "TIMEOUT",
  "NETWORK_ERROR",
  "DNS_FAIL",
  "EMPTY_CONTENT",
  "UNSUPPORTED_CONTENT_TYPE",
  "REDIRECT_LOOP",
]);

interface FailureState {
  sourceId: string;
  url: string;
  domain: string;
  code?: string;
  message: string;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function inferAuthority(domain: string): Authority {
  const value = domain.toLowerCase();
  if (/\.gov(\.|$)|\.edu(\.|$)|\.ac\.|\.nic\./.test(value)) return "official";
  if (/forum|reddit|quora|stackexchange/.test(value)) return "community";
  return "secondary";
}

function AuthorityBadge({ authority }: { authority: Authority }) {
  if (authority === "official") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Official
      </span>
    );
  }
  if (authority === "community") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-conflict">
        <Shield className="size-3.5" aria-hidden="true" />
        Community
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
      <Shield className="size-3.5" aria-hidden="true" />
      Secondary
    </span>
  );
}

export default function AskPage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [sources, setSources] = useState<DraftSource[]>([]);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [addingSource, setAddingSource] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedLabel, setPastedLabel] = useState<string | null>(null);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const pasteRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!failure) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setFailure(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [failure]);

  async function verifySource(id: string, url: string) {
    try {
      const response = await fetch("/api/fetch-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        durationMs?: number;
        snapshot?: { domain: string; title: string; errorCode?: string; errorMessage?: string };
      };

      if (!response.ok) {
        const message =
          payload.snapshot?.errorMessage ?? `The source could not be checked (HTTP ${response.status}).`;
        setSources((current) =>
          current.map((source) =>
            source.id === id ? { ...source, status: "failed", note: message } : source,
          ),
        );
        return;
      }

      setSources((current) =>
        current.map((source) =>
          source.id === id
            ? {
                ...source,
                status: payload.ok ? "ok" : "failed",
                domain: payload.snapshot?.domain ?? source.domain,
                title: payload.snapshot?.title,
                code: payload.snapshot?.errorCode,
                note: payload.ok ? undefined : (payload.snapshot?.errorMessage ?? "Could not read"),
              }
            : source,
        ),
      );

      // Only a genuine failure offers the paste fallback. A slow page that
      // eventually loads never reaches this branch.
      const code = payload.snapshot?.errorCode;
      if (!payload.ok && code && BLOCKING_CODES.has(code)) {
        setFailure({
          sourceId: id,
          url,
          domain: payload.snapshot?.domain ?? domainFromUrl(url),
          code,
          message: payload.snapshot?.errorMessage ?? "The page could not be read.",
        });
      }
    } catch (error) {
      setSources((current) =>
        current.map((source) =>
          source.id === id
            ? {
                ...source,
                status: "failed",
                note: `Could not check this link. ${
                  error instanceof Error ? error.message.slice(0, 120) : "The request failed."
                }`,
              }
            : source,
        ),
      );
    }
  }

  function applyExample(example: ExamplePreset) {
    setExamplesOpen(false);
    setQuestion(example.question);
    setError(null);
    setPasteMode(false);
    setFailure(null);

    const next: DraftSource[] = example.sources.map((source, index) => ({
      id: `d${Date.now()}-${index}`,
      domain: source.domain,
      url: source.url,
      kind: "url",
      authority: inferAuthority(source.domain),
      status: "checking",
    }));

    setSources(next);
    for (const source of next) void verifySource(source.id, source.url);
  }

  function pasteInsteadOfFailure() {
    if (!failure) return;
    setPastedLabel(failure.domain);
    setFailure(null);
    setPasteMode(true);
    setAddingSource(false);
    setPastedText("");
    setError(null);
    // The failed link is being replaced by its text, not kept as a dead entry.
    setSources((current) => current.filter((source) => source.id !== failure.sourceId));
    requestAnimationFrame(() => pasteRef.current?.focus());
  }

  function retryFailedSource() {
    if (!failure) return;
    const { sourceId, url } = failure;
    setFailure(null);
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId
          ? { ...source, status: "checking", note: undefined, code: undefined }
          : source,
      ),
    );
    void verifySource(sourceId, url);
  }

  function addSource() {
    const raw = newUrl.trim();
    if (!raw) {
      setError("Add a link or cancel.");
      return;
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      if (!/^https?:$/.test(parsedUrl.protocol)) throw new Error("bad scheme");
    } catch {
      setError("That does not look like a web link.");
      return;
    }
    if (sources.length >= 6) {
      setError("Six sources is the limit for one analysis.");
      return;
    }

    const domain = parsedUrl.hostname.replace(/^www\./, "");
    const normalized = parsedUrl.toString();
    const id = `d${Date.now()}`;

    setSources((current) => [
      ...current,
      {
        id,
        domain,
        url: normalized,
        kind: "url",
        authority: inferAuthority(domain),
        status: "checking",
      },
    ]);
    setNewUrl("");
    setAddingSource(false);
    setError(null);
    void verifySource(id, normalized);
  }

  function addPastedText() {
    const text = pastedText.trim();
    const label = pastedLabel?.trim() || "Pasted text";

    if (text.length < 300) {
      setError("Paste at least a few paragraphs (about 300 characters) so there is something to audit.");
      return;
    }
    if (sources.length >= 6) {
      setError("Six sources is the limit for one analysis.");
      return;
    }

    setSources((current) => [
      ...current,
      {
        id: `p${Date.now()}`,
        domain: label,
        url: "pasted-text",
        kind: "text",
        text,
        authority: inferAuthority(label),
        status: "ok",
      },
    ]);
    setPastedText("");
    setPastedLabel(null);
    setPasteMode(false);
    setError(null);
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  async function analyze() {
    if (!question.trim()) {
      setError("Add a question first.");
      return;
    }
    if (sources.length === 0) {
      setError("Add at least one source.");
      return;
    }
    if (sources.some((source) => source.status === "checking")) {
      setError("Wait until every source finishes checking.");
      return;
    }

    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          sources: sources.map((source) =>
            source.kind === "text"
              ? { text: source.text ?? "", label: source.domain }
              : source.status === "failed"
                ? {
                    url: source.url,
                    failed: {
                      code: source.code ?? "NETWORK_ERROR",
                      message: source.note ?? "This source could not be read.",
                    },
                  }
                : { url: source.url },
          ),
        }),
      });

      const payload = (await response.json()) as {
        ok: boolean;
        message?: string;
        code?: string;
        analysis?: unknown;
      };

      if (!response.ok || !payload.ok || !payload.analysis) {
        setError(payload.message ?? "The analysis could not be completed.");
        return;
      }

      sessionStorage.setItem("blindspot:live", JSON.stringify(payload));
      router.push("/analysis/live");
    } catch {
      setError("Could not reach the analyzer. Check your connection and try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-4 pt-7">
      <div className="text-center">
        <p className="inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-brand">
          <span className="h-px w-6 bg-brand/35" aria-hidden="true" />
          Research with evidence
          <span className="h-px w-6 bg-brand/35" aria-hidden="true" />
        </p>
        <h1 className="mt-2.5 text-[2rem] font-extrabold leading-tight tracking-tight text-ink sm:text-[2.5rem]">
          Know what your sources leave out.
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          Audit your sources to see what&apos;s covered, what&apos;s missing, and what to verify next.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(11,31,51,0.05)] sm:p-6">
        {/* Question */}
        <div className="flex items-center justify-between">
          <label
            htmlFor="question"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
          >
            Your question
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setExamplesOpen((value) => !value)}
              aria-expanded={examplesOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1 rounded-lg px-1 py-1 text-sm text-muted transition hover:text-ink"
            >
              Examples
              <ChevronDown
                className={cn("size-4 transition", examplesOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {examplesOpen ? (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExamplesOpen(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  className="absolute right-0 z-20 mt-2 w-[22rem] max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-2 shadow-lg"
                >
                  <p className="px-3 pb-2 pt-1 text-xs uppercase tracking-[0.16em] text-missing">
                    Load an example
                  </p>
                  {examples.map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      role="menuitem"
                      onClick={() => applyExample(example)}
                      className="block w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-canvas"
                    >
                      <span className="block text-sm font-semibold text-ink">{example.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted">
                        {example.question}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {example.sources.map((source) => (
                          <span
                            key={source.url}
                            className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand"
                          >
                            {source.domain}
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-line focus-within:border-mint">
          <textarea
            id="question"
            value={question}
            maxLength={2000}
            rows={3}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={SUGGESTED_QUESTION}
            className="w-full resize-none rounded-lg bg-transparent px-4 py-2.5 text-base text-ink outline-none placeholder:text-missing"
          />
          <div className="flex justify-end px-4 pb-1.5 text-[11px] text-muted">
            {question.length}/2000
          </div>
        </div>

        {/* Sources */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Sources
            <Info
              className="size-3.5 text-missing"
              aria-label="Only pages you add are fetched. Nothing is stored."
            />
          </span>
          <div className="flex items-center gap-3">
            {sources.length > 0 ? (
              <span className="text-xs text-muted">{sources.length}/6</span>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPasteMode((value) => !value);
                if (!pasteMode) setPastedLabel(null);
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-soft/70"
            >
              <ClipboardPaste className="size-3.5" aria-hidden="true" />
              {pasteMode ? "Use links instead" : "Paste text instead"}
            </button>
          </div>
        </div>

        {/* The honest limitation, stated up front. Many official sites block bots. */}
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-brand-soft px-3.5 py-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-ink-soft">
            Some websites may block automated access. If a page doesn&apos;t load, you can copy
            its content and paste it instead.
          </p>
        </div>

        <div className="mt-2.5 space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3.5 py-2.5",
                source.status === "failed" ? "border-conflict/40 bg-rose-50/40" : "border-line",
              )}
            >
              {source.kind === "text" ? (
                <FileText className="size-4 shrink-0 text-missing" aria-hidden="true" />
              ) : (
                <Link2 className="size-4 shrink-0 text-missing" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{source.domain}</p>
                {source.kind === "text" ? (
                  <p className="truncate text-xs text-muted">
                    Pasted text · {(source.text ?? "").length.toLocaleString()} characters
                  </p>
                ) : null}
                {source.status === "checking" ? (
                  <p className="text-xs text-muted">Checking the page…</p>
                ) : null}
                {source.status === "ok" && source.title ? (
                  <p className="truncate text-xs text-muted">{source.title}</p>
                ) : null}
                {source.status === "failed" ? (
                  <p className="text-xs text-conflict">{source.note}</p>
                ) : null}
              </div>
              <AuthorityBadge authority={source.authority} />
              <button
                type="button"
                onClick={() => removeSource(source.id)}
                aria-label={`Remove ${source.domain}`}
                className="rounded-md p-1 text-missing transition hover:bg-canvas hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>

        {pasteMode ? (
          <div className="mt-2.5 rounded-lg border border-line p-3">
            {pastedLabel ? (
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                  {pastedLabel}
                </span>
                <span className="text-xs text-muted">
                  Replacing the link we could not read
                </span>
              </div>
            ) : null}
            <textarea
              ref={pasteRef}
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              rows={5}
              placeholder="Paste the page's main content here — the rules, dates, amounts and documents. Navigation menus and cookie notices are ignored."
              className="w-full resize-none rounded-lg bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-missing"
            />
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-xs text-muted">
                {pastedText.trim().length.toLocaleString()} characters
                {pastedText.trim().length < 300 ? " · need about 300" : ""}
              </span>
              <button
                type="button"
                onClick={addPastedText}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Add pasted source
              </button>
            </div>
          </div>
        ) : null}

        {addingSource ? (
          <div className="mt-2.5 rounded-lg border border-mint bg-canvas p-3">
            <div className="flex gap-2">
              <input
                autoFocus
                value={newUrl}
                onChange={(event) => setNewUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addSource();
                  }
                }}
                placeholder="https://example.gov.in/scholarship"
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-missing focus:border-mint"
              />
              <button
                type="button"
                onClick={addSource}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSource(false);
                  setNewUrl("");
                  setError(null);
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingSource(true)}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-brand/40 py-2.5 text-sm font-medium text-brand transition hover:bg-brand-soft/50"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add source
          </button>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-conflict">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={analyze}
          disabled={analyzing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
        >
          {analyzing ? (
            <LoaderCircle className="size-[18px] animate-spin" aria-hidden="true" />
          ) : (
            <Search className="size-[18px]" aria-hidden="true" />
          )}
          {analyzing ? "Reading sources and verifying quotes…" : "Analyze sources"}
          {analyzing ? null : <ArrowRight className="size-[18px]" aria-hidden="true" />}
        </button>

        <div className="my-3 flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-missing">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={() => router.push("/analysis/demo")}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 px-6 py-3 text-[15px] font-semibold text-ink-soft transition hover:bg-slate-200"
        >
          <FileText className="size-[18px]" aria-hidden="true" />
          Load demo scenario
        </button>
      </div>

      <AspectStrip
        items={aspects}
        className="px-0 pt-6"
        subheading="Your question will be analyzed across these key aspects."
      />

      <p className={cn("mt-4 text-center text-xs leading-relaxed text-muted")}>
        Every claim is checked against the saved page text before it appears. Pages are read
        server-side for this request only and are never stored.
      </p>

      {failure ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="fetch-failure-title"
            className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft">
                <TriangleAlert className="size-5 text-brand" aria-hidden="true" />
              </span>
              <button
                type="button"
                onClick={() => setFailure(null)}
                aria-label="Close"
                className="rounded-md p-1 text-missing transition hover:bg-canvas hover:text-ink"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <h2 id="fetch-failure-title" className="mt-4 text-xl font-semibold tracking-tight text-ink">
              We couldn&apos;t access this webpage.
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Some websites restrict automated reading. You can still analyze this source by
              copying its content and pasting it directly.
            </p>

            <div className="mt-4 rounded-lg bg-canvas px-3 py-2.5">
              <p className="truncate text-xs font-medium text-ink-soft">{failure.domain}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{failure.message}</p>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={pasteInsteadOfFailure}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                <ClipboardPaste className="size-4" aria-hidden="true" />
                Paste text instead
              </button>
              <button
                type="button"
                onClick={retryFailedSource}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-canvas"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Retry URL
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
