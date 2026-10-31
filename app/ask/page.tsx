"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChevronDown,
  FileText,
  Info,
  Link2,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  X,
} from "lucide-react";
import AspectStrip from "@/components/aspect-strip";
import { aspects } from "@/lib/demo";
import type { Authority } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DraftSource {
  id: string;
  domain: string;
  authority: Authority;
}

const initialSources: DraftSource[] = [
  { id: "d1", domain: "nsp.gov.in", authority: "official" },
  { id: "d2", domain: "scholarshiphub.org", authority: "secondary" },
  { id: "d3", domain: "collegepedia.edu", authority: "secondary" },
];

const examples = [
  "What should I verify before applying for this scholarship?",
  "What are the renewal conditions for this scholarship?",
  "Which documents are officially required for renewal?",
];

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
  const [question, setQuestion] = useState(examples[0]);
  const [sources, setSources] = useState<DraftSource[]>(initialSources);
  const [addingSource, setAddingSource] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function addSource() {
    const raw = newUrl.trim();
    if (!raw) {
      setError("Add a link or cancel.");
      return;
    }
    let domain: string;
    try {
      const parsed = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("bad scheme");
      domain = parsed.hostname.replace(/^www\./, "");
    } catch {
      setError("That does not look like a web link.");
      return;
    }
    if (sources.length >= 6) {
      setError("Six sources is the limit for one analysis.");
      return;
    }
    setSources((current) => [
      ...current,
      { id: `d${Date.now()}`, domain, authority: inferAuthority(domain) },
    ]);
    setNewUrl("");
    setAddingSource(false);
    setError(null);
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  function analyze() {
    if (!question.trim()) {
      setError("Add a question first.");
      return;
    }
    if (sources.length === 0) {
      setError("Add at least one source.");
      return;
    }
    router.push("/analysis/demo");
  }

  return (
    <div className="mx-auto max-w-4xl px-6 pb-4 pt-10">
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-brand">
          Research with evidence
        </p>
        <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Know what your sources leave out.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Blindspot audits your sources to show what they cover, what&apos;s missing, where they
          contradict, and what you should verify next.
        </p>
      </div>

      <div className="mt-9 rounded-2xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(11,31,51,0.05)] sm:p-8">
        {/* Question */}
        <div className="flex items-center justify-between">
          <label
            htmlFor="question"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
          >
            Your question
          </label>
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted transition hover:text-ink">
              Examples
              <ChevronDown className="size-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-line bg-surface p-2 shadow-lg">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestion(example)}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-soft transition hover:bg-canvas"
                >
                  {example}
                </button>
              ))}
            </div>
          </details>
        </div>
        <div className="mt-3 rounded-xl border border-line focus-within:border-mint">
          <textarea
            id="question"
            value={question}
            maxLength={2000}
            rows={3}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a question about something you need to decide."
            className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-base text-ink outline-none placeholder:text-missing"
          />
          <div className="flex justify-end px-4 pb-2 text-xs text-muted">
            {question.length}/2000
          </div>
        </div>

        {/* Sources */}
        <div className="mt-6 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Sources
            <Info
              className="size-3.5 text-missing"
              aria-label="Only pages you add are fetched. Nothing is stored."
            />
          </span>
          <button
            type="button"
            onClick={() => setPasteMode((value) => !value)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand transition hover:text-brand-dark"
          >
            <FileText className="size-4" aria-hidden="true" />
            {pasteMode ? "Use links instead" : "Paste text instead"}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3"
            >
              <Link2 className="size-4 shrink-0 text-missing" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{source.domain}</span>
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
          <div className="mt-3 rounded-xl border border-line">
            <textarea
              value={pastedText}
              onChange={(event) => setPastedText(event.target.value)}
              rows={5}
              placeholder="Paste the text of a page that cannot be fetched. It will be treated as a snapshot."
              className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm text-ink outline-none placeholder:text-missing"
            />
          </div>
        ) : null}

        {addingSource ? (
          <div className="mt-3 rounded-xl border border-mint bg-canvas p-3">
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
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 py-3 text-sm font-medium text-brand transition hover:bg-brand-soft/50"
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
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3.5 text-base font-semibold text-white transition hover:bg-brand-dark"
        >
          <Search className="size-5" aria-hidden="true" />
          Analyze sources
          <ArrowRight className="size-5" aria-hidden="true" />
        </button>

        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-missing">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <button
          type="button"
          onClick={() => router.push("/analysis/demo")}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-6 py-3.5 text-base font-semibold text-ink-soft transition hover:bg-slate-200"
        >
          <FileText className="size-5" aria-hidden="true" />
          Load demo scenario
        </button>
      </div>

      <AspectStrip
        items={aspects}
        className="px-0 pt-10"
        subheading="Your question will be analyzed across these key aspects."
      />

      <p className={cn("mt-6 text-center text-xs leading-relaxed text-muted")}>
        This build runs on a saved demo result. Live analysis will call Gemini server-side, and no
        source text leaves your browser session.
      </p>
    </div>
  );
}
