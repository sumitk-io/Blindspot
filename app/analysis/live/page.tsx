"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import AnalysisView from "@/components/analysis-view";
import type { AnalysisData } from "@/lib/types";

const STORAGE_KEY = "blindspot:live";

export default function LiveAnalysisPage() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty">("loading");

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setState("empty");
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { analysis?: AnalysisData } | AnalysisData;
      const analysis = "analysis" in parsed && parsed.analysis ? parsed.analysis : (parsed as AnalysisData);
      if (!analysis?.aspects?.length) {
        setState("empty");
        return;
      }
      setData(analysis);
      setState("ready");
    } catch {
      setState("empty");
    }
  }, []);

  if (state === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center px-6 py-24">
        <LoaderCircle className="size-6 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  if (state === "empty" || !data) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold tracking-tight">No analysis in this tab yet</h1>
        <p className="mt-3 text-muted">
          Results are held in the browser session and are never stored on a server. Run an analysis
          to see it here.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/ask"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the question
          </Link>
          <Link
            href="/analysis/demo"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-ink-soft transition hover:bg-slate-200"
          >
            Load demo scenario
          </Link>
        </div>
      </div>
    );
  }

  return <AnalysisView data={data} analysisId="live" />;
}
