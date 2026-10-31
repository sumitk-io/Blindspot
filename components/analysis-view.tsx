"use client";

import Link from "next/link";
import { useState, type ComponentType } from "react";
import {
  ArrowLeft,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock,
  Download,
  ExternalLink,
  Grid2x2,
  Info,
  Link2,
  ListChecks,
  Quote,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { AnalysisData, CellState, FindingKind, Priority, Source } from "@/lib/types";
import { cn } from "@/lib/utils";

const dotStyles: Record<Exclude<CellState, "unavailable">, string> = {
  covered: "bg-covered",
  partial: "bg-partial",
  conflict: "bg-conflict ring-4 ring-conflict/15",
  missing: "bg-missing",
};

const dotLabels: Record<CellState, string> = {
  covered: "Covered",
  partial: "Partial",
  conflict: "Conflict",
  missing: "Missing",
  unavailable: "Not available",
};

const priorityStyles: Record<Priority, string> = {
  High: "bg-rose-50 text-conflict",
  Medium: "bg-amber-50 text-amber-600",
  Low: "bg-slate-100 text-slate-500",
};

const groups: {
  kind: FindingKind;
  label: string;
  icon: ComponentType<{ className?: string }>;
  card: string;
  iconWrap: string;
  chip: string;
}[] = [
  {
    kind: "gap",
    label: "Gaps",
    icon: CircleHelp,
    card: "border-sky-100 bg-sky-50/50",
    iconWrap: "bg-sky-100 text-sky-600",
    chip: "bg-sky-100 text-sky-700",
  },
  {
    kind: "conflict",
    label: "Conflicts",
    icon: CircleAlert,
    card: "border-rose-100 bg-rose-50/50",
    iconWrap: "bg-rose-100 text-conflict",
    chip: "bg-rose-100 text-conflict",
  },
  {
    kind: "outdated",
    label: "Outdated",
    icon: Clock,
    card: "border-amber-100 bg-amber-50/50",
    iconWrap: "bg-amber-100 text-amber-600",
    chip: "bg-amber-100 text-amber-700",
  },
];

function MatrixDot({ state }: { state: CellState }) {
  if (state === "unavailable") {
    return (
      <span className="text-sm text-missing" title={dotLabels.unavailable}>
        —
      </span>
    );
  }
  return (
    <span
      title={dotLabels[state]}
      className={cn("inline-block size-3.5 rounded-full", dotStyles[state])}
    />
  );
}

function SourceBadge({ source }: { source: Source }) {
  if (source.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-conflict">
        <Shield className="size-3" aria-hidden="true" />
        Failed{source.note ? ` · ${source.note}` : ""}
      </span>
    );
  }
  if (source.authority === "official") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
        <ShieldCheck className="size-3" aria-hidden="true" />
        Official
      </span>
    );
  }
  if (source.authority === "community") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-conflict">
        <Shield className="size-3" aria-hidden="true" />
        Community
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
      <Shield className="size-3" aria-hidden="true" />
      Secondary
    </span>
  );
}

export default function AnalysisView({
  data,
  analysisId,
}: {
  data: AnalysisData;
  analysisId: string;
}) {
  const [openGroups, setOpenGroups] = useState<Record<FindingKind, boolean>>({
    gap: true,
    conflict: true,
    outdated: true,
  });
  const [checked, setChecked] = useState<string[]>([]);

  const stateOf = (aspectId: string, sourceId: string): CellState =>
    data.cells.find((cell) => cell.aspectId === aspectId && cell.sourceId === sourceId)?.state ??
    "missing";

  const gapAspects = new Set(
    data.aspects
      .filter((aspect) =>
        data.sources.every((source) => {
          const state = stateOf(aspect.id, source.id);
          return state === "missing" || state === "unavailable";
        }),
      )
      .map((aspect) => aspect.id),
  );

  function toggleGroup(kind: FindingKind) {
    setOpenGroups((current) => ({ ...current, [kind]: !current[kind] }));
  }

  function toggleItem(id: string) {
    setChecked((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function exportReport() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "blindspot-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const isDemo = analysisId === "demo";

  return (
    <div className="mx-auto max-w-6xl px-6 pb-10 pt-8">
      <Link
        href="/ask"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to input
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Scholarship verification</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <span
              className={cn(
                "inline-block size-2 rounded-full",
                data.reducedConfidence ? "bg-partial" : "bg-covered",
              )}
            />
            {data.statusLine}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
            data.reducedConfidence ? "bg-amber-50 text-amber-700" : "bg-brand-soft text-brand",
          )}
        >
          <span className="inline-block size-1.5 rounded-full bg-current" />
          {isDemo ? "Demo · saved result" : "Live analysis"}
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Coverage matrix */}
          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <Grid2x2 className="size-5 text-ink" aria-hidden="true" />
                  Coverage matrix
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Each source is checked against key aspects of a complete answer.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-muted">
                <Info className="size-3.5" aria-hidden="true" />
                How to read this?
              </span>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-line bg-canvas/70">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Source
                    </th>
                    {data.aspects.map((aspect) => (
                      <th
                        key={aspect.id}
                        className={cn(
                          "px-2 py-3 text-center text-xs font-semibold",
                          gapAspects.has(aspect.id) ? "bg-brand-soft/50 text-brand" : "text-muted",
                        )}
                      >
                        {aspect.label}
                        {gapAspects.has(aspect.id) ? (
                          <span className="mt-1 block text-[10px] font-bold tracking-[0.16em]">
                            GAP
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((source) => (
                    <tr key={source.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link2 className="size-3.5 shrink-0 text-missing" aria-hidden="true" />
                          <span
                            className={cn(
                              "truncate text-sm",
                              source.status === "failed" ? "text-muted line-through" : "text-ink",
                            )}
                          >
                            {source.domain}
                          </span>
                        </div>
                        <div className="mt-1 pl-5">
                          <SourceBadge source={source} />
                        </div>
                      </td>
                      {data.aspects.map((aspect) => (
                        <td
                          key={aspect.id}
                          className={cn(
                            "px-2 py-3 text-center",
                            gapAspects.has(aspect.id) && "bg-brand-soft/40",
                          )}
                        >
                          <MatrixDot state={stateOf(aspect.id, source.id)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-5">
              {[
                { state: "covered" as CellState, label: "Covered", detail: "Clear information found" },
                { state: "partial" as CellState, label: "Partial", detail: "Some information, incomplete" },
                { state: "conflict" as CellState, label: "Conflict", detail: "Sources disagree" },
                { state: "missing" as CellState, label: "Missing", detail: "Not found in any source" },
                { state: "unavailable" as CellState, label: "Not available", detail: "Source could not be read" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-2">
                  <span className="mt-1">
                    <MatrixDot state={item.state} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-ink">{item.label}</p>
                    <p className="text-[11px] leading-snug text-muted">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Checklist */}
          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <ListChecks className="size-5 text-ink" aria-hidden="true" />
                  Verify next
                </h2>
                <p className="mt-1 text-sm text-muted">Ranked by importance and gap severity</p>
              </div>
              <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-medium text-muted">
                {data.checklist.length} items
              </span>
            </div>

            <ul className="mt-4 divide-y divide-line">
              {data.checklist.map((item) => {
                const done = checked.includes(item.id);
                return (
                  <li key={item.id} className="flex items-start gap-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      aria-pressed={done}
                      aria-label={`Mark: ${item.text}`}
                      className={cn(
                        "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition",
                        done ? "border-brand bg-brand text-white" : "border-missing bg-surface",
                      )}
                    >
                      {done ? (
                        <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden="true">
                          <path
                            d="M3 8.5 6 11.5 13 4.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm text-ink", done && "line-through text-muted")}>
                        {item.text}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{item.whereToLook}</p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        priorityStyles[item.priority],
                      )}
                    >
                      {item.priority}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CircleHelp className="size-5 text-ink" aria-hidden="true" />
                Findings
              </h2>
              <span className="text-xs text-muted">{data.findings.length} key issues detected</span>
            </div>

            <div className="mt-4 space-y-3">
              {groups.map((group) => {
                const items = data.findings.filter((finding) => finding.kind === group.kind);
                if (items.length === 0) return null;
                const Icon = group.icon;
                const isOpen = openGroups[group.kind];
                return (
                  <div key={group.kind} className={cn("rounded-xl border", group.card)}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.kind)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className={cn("grid size-7 place-items-center rounded-full", group.iconWrap)}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 text-sm font-semibold text-ink">{group.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-bold",
                          group.chip,
                        )}
                      >
                        {items.length}
                      </span>
                      <ChevronDown
                        className={cn("size-4 text-muted transition", isOpen && "rotate-180")}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen ? (
                      <div className="space-y-3 border-t border-white/70 px-4 pb-4 pt-3">
                        {items.map((finding) => (
                          <div key={finding.id}>
                            <p className="text-sm font-semibold leading-snug text-ink">
                              {finding.title}
                            </p>
                            <p className="mt-1 text-xs leading-relaxed text-muted">
                              {finding.detail}
                            </p>
                            <button
                              type="button"
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand"
                            >
                              View details
                              <ChevronDown className="size-3.5 -rotate-90" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-mint/40 bg-brand-soft/40 p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Quote className="size-4 text-brand" aria-hidden="true" />
                Evidence
              </h2>
              <span className="text-xs text-brand">
                {data.evidence.sourceCount} sources · {data.evidence.quoteCount} quotes
              </span>
            </div>

            <blockquote className="mt-4 rounded-xl border-l-2 border-brand bg-surface/80 px-4 py-3 text-sm leading-relaxed text-ink">
              &ldquo;{data.evidence.quote}&rdquo;
            </blockquote>
            <p className="mt-2 text-[11px] text-muted">
              {data.evidence.domain} · {data.evidence.fetchedAt} · {data.evidence.sha256}
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                href={`https://${data.evidence.domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand/30 bg-surface px-4 py-2.5 text-xs font-semibold text-brand transition hover:bg-brand-soft"
              >
                <ExternalLink className="size-3.5" aria-hidden="true" />
                Open original sources
              </a>
              <button
                type="button"
                onClick={exportReport}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
              >
                <Download className="size-3.5" aria-hidden="true" />
                Export report (JSON)
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
