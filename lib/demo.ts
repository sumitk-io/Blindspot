import type { AnalysisData, Aspect, Cell, CellState, Source } from "@/lib/types";

export const aspects: Aspect[] = [
  { id: "eligibility", label: "Eligibility", icon: "users", tint: "bg-emerald-50 text-emerald-600" },
  { id: "deadline", label: "Deadline", icon: "calendar", tint: "bg-sky-50 text-sky-600" },
  { id: "documents", label: "Documents", icon: "file", tint: "bg-violet-50 text-violet-600" },
  { id: "renewal", label: "Renewal", icon: "refresh", tint: "bg-amber-50 text-amber-600" },
  { id: "process", label: "Process", icon: "settings", tint: "bg-rose-50 text-rose-600" },
  { id: "amount", label: "Amount", icon: "layers", tint: "bg-pink-50 text-pink-600" },
];

export const sources: Source[] = [
  {
    id: "s1",
    domain: "nsp.gov.in",
    url: "https://nsp.gov.in",
    authority: "official",
    status: "ok",
  },
  {
    id: "s2",
    domain: "scholarshiphub.org",
    url: "https://scholarshiphub.org",
    authority: "secondary",
    status: "ok",
  },
  {
    id: "s3",
    domain: "collegepedia.edu",
    url: "https://collegepedia.edu",
    authority: "secondary",
    status: "ok",
  },
  {
    id: "s4",
    domain: "forumthread.io",
    url: "https://forumthread.io",
    authority: "community",
    status: "ok",
  },
  {
    id: "s5",
    domain: "blockedlink.example",
    url: "https://blockedlink.example",
    authority: "secondary",
    status: "failed",
    note: "HTTP 403",
  },
];

const matrix: Record<string, CellState[]> = {
  s1: ["covered", "covered", "covered", "missing", "covered", "covered"],
  s2: ["covered", "partial", "covered", "missing", "partial", "missing"],
  s3: ["covered", "covered", "conflict", "missing", "covered", "partial"],
  s4: ["partial", "missing", "missing", "missing", "missing", "missing"],
  s5: ["unavailable", "unavailable", "unavailable", "unavailable", "unavailable", "unavailable"],
};

export const cells: Cell[] = sources.flatMap((source) =>
  aspects.map((aspect, index) => ({
    aspectId: aspect.id,
    sourceId: source.id,
    state: matrix[source.id][index],
  })),
);

export const demoAnalysis: AnalysisData = {
  question: "What should I verify before applying for this scholarship?",
  statusLine: "4 of 5 sources read · 1 failed (HTTP 403) · running in reduced confidence",
  reducedConfidence: true,
  sources,
  aspects,
  cells,
  findings: [
    {
      id: "f1",
      kind: "gap",
      title: "Renewal conditions not found in any of the sources reviewed",
      detail:
        "None of the sources clearly mention renewal rules, criteria, or the process for subsequent years. This gap may be incomplete rather than real: one source could not be read.",
    },
    {
      id: "f2",
      kind: "conflict",
      title: "Two sources disagree on the required income documents",
      detail:
        "nsp.gov.in mentions an income certificate, while collegepedia.edu mentions both an income certificate and a bank statement.",
    },
    {
      id: "f3",
      kind: "outdated",
      title: "Forum post refers to the 2019 cycle",
      detail:
        "The forum post appears to describe an older application cycle and may not reflect current rules.",
    },
  ],
  checklist: [
    {
      id: "c1",
      text: "Confirm the current renewal rules with the official body",
      whereToLook: "Where to look: official FAQ page or scheme contact",
      priority: "High",
    },
    {
      id: "c2",
      text: "Check the official document list against both sources",
      whereToLook: "Where to look: scheme guidelines PDF",
      priority: "Medium",
    },
    {
      id: "c3",
      text: "Verify the application deadline for the current cycle",
      whereToLook: "Where to look: official notice board",
      priority: "Medium",
    },
    {
      id: "c4",
      text: "Re-check the blocked source, or paste its text manually",
      whereToLook: "Where to look: try accessing from a different network or paste content directly",
      priority: "Low",
    },
  ],
  evidence: {
    quote: "Renewal is subject to satisfactory academic progress each year.",
    domain: "nsp.gov.in",
    fetchedAt: "fetched 31 Oct 2026",
    sha256: "sha256:4f9c…a12",
    sourceCount: 3,
    quoteCount: 5,
  },
};

export type { AnalysisData };
