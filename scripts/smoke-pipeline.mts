import { analyze, type AnalyzeDeps } from "../lib/pipeline/analyze.ts";
import type { SourceSnapshot } from "../lib/snapshot.ts";
import type { PipelineAspect } from "../lib/pipeline/model-stages.ts";

const aspects: PipelineAspect[] = [
  { id: "eligibility", label: "Eligibility", icon: "users", tint: "", keywords: ["eligible", "must", "applicant"] },
  { id: "deadline", label: "Deadline", icon: "calendar", tint: "", keywords: ["deadline", "last date", "close"] },
  { id: "documents", label: "Documents", icon: "file", tint: "", keywords: ["document", "certificate", "submit"] },
  { id: "amount", label: "Amount", icon: "layers", tint: "", keywords: ["amount", "fee", "percent", "capped"] },
  { id: "renewal", label: "Renewal", icon: "refresh", tint: "", keywords: ["renewal", "renew", "year"] },
];

function snapshot(partial: Partial<SourceSnapshot> & Pick<SourceSnapshot, "id" | "domain" | "text">): SourceSnapshot {
  return {
    url: `https://${partial.domain}/`,
    finalUrl: `https://${partial.domain}/`,
    title: partial.domain,
    siteName: null,
    sha256: "0".repeat(64),
    fetchedAt: "2026-11-20T09:00:00.000Z",
    publishedAt: null,
    dateConfidence: "none",
    contentType: "text/html",
    bytes: partial.text.length,
    truncated: false,
    status: "ok",
    ...partial,
  };
}

const official = snapshot({
  id: "s1",
  domain: "nsp.gov.in",
  publishedAt: "2026-08-01T00:00:00.000Z",
  dateConfidence: "high",
  text: [
    "The National Scholarship Portal is open for applications for the academic year 2026-27.",
    "Applicants must submit an income certificate issued by the competent authority.",
    "The last date for submission is 31 October 2026.",
    "A student may receive up to 50% of the tuition fee, capped at \u20b950,000.",
    "Renewal is subject to satisfactory academic progress each year.",
  ].join("\n\n"),
});

const secondary = snapshot({
  id: "s2",
  domain: "scholarshiphub.org",
  publishedAt: "2019-03-05T00:00:00.000Z",
  dateConfidence: "high",
  text: [
    "Applications close on 15 November 2026 according to our guide.",
    "Applicants must submit an income certificate and a bank statement.",
    "A student may receive up to 75% of the tuition fee.",
  ].join("\n\n"),
});

const failed = snapshot({
  id: "s3",
  domain: "blockedlink.example",
  text: "",
  status: "failed",
  errorCode: "HTTP_ERROR",
  errorMessage: "The source returned HTTP 403.",
});

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const modelDeps: AnalyzeDeps = {
  decompose: async () => ({ aspects, fromModel: true }),
  extract: async () => [
    {
      sourceId: "s1",
      aspectId: "deadline",
      statement: "The portal closes on 31 October 2026.",
      quote: "The last date for submission is 31 October 2026.",
    },
    {
      sourceId: "s2",
      aspectId: "deadline",
      statement: "Applications close on 15 November 2026.",
      quote: "Applications close on 15 November 2026 according to our guide.",
    },
    {
      sourceId: "s1",
      aspectId: "amount",
      statement: "Award is 50% of tuition, capped at Rs 50,000.",
      quote: "A student may receive up to 50% of the tuition fee, capped at \u20b950,000.",
    },
    {
      sourceId: "s2",
      aspectId: "amount",
      statement: "Award is 75% of tuition.",
      quote: "A student may receive up to 75% of the tuition fee.",
    },
    {
      sourceId: "s1",
      aspectId: "documents",
      statement: "An income certificate is required.",
      quote: "Applicants must submit an income certificate issued by the competent authority.",
    },
    {
      // Deliberately fabricated: must not survive verification.
      sourceId: "s1",
      aspectId: "renewal",
      statement: "Renewal needs a police clearance certificate.",
      quote: "Renewal requires a police clearance certificate from the local station.",
    },
  ],
  audit: async () => [],
};

const now = new Date("2026-11-20T00:00:00.000Z");
const result = await analyze(
  { question: "What should I verify before applying for this scholarship?", sources: [official, secondary, failed], now },
  modelDeps,
);

const { analysis, diagnostics } = result;

check("five aspects in matrix", analysis.aspects.length === 5, `${analysis.aspects.length}`);
check("all cells present", analysis.cells.length === 15, `${analysis.cells.length}`);
check("failed source unavailable", analysis.cells.filter((c) => c.sourceId === "s3").every((c) => c.state === "unavailable"));
check("verified quotes counted", diagnostics.quotesVerified === 5, `${diagnostics.quotesVerified}`);
check("fabricated quote rejected", diagnostics.quotesRejected === 1, `${diagnostics.quotesRejected}`);
check("reduced confidence flagged", analysis.reducedConfidence);

const deadlineS1 = analysis.cells.find((c) => c.aspectId === "deadline" && c.sourceId === "s1");
const amountS1 = analysis.cells.find((c) => c.aspectId === "amount" && c.sourceId === "s1");
check("deadline cell is a conflict", deadlineS1?.state === "conflict", deadlineS1?.state);
check("amount cell is a conflict", amountS1?.state === "conflict", amountS1?.state);

const states = new Set(analysis.cells.map((cell) => cell.state));
check(
  "matrix shows covered, conflict, missing, unavailable",
  ["covered", "conflict", "missing", "unavailable"].every((state) => states.has(state as never)),
  [...states].join(","),
);

const kinds = new Set(analysis.findings.map((finding) => finding.kind));
check("gap finding present", kinds.has("gap"), [...kinds].join(","));
check("conflict finding present", kinds.has("conflict"));
check("outdated finding present", kinds.has("outdated"));
check(
  "conflict names both domains",
  analysis.findings.some((f) => f.kind === "conflict" && f.detail.includes("nsp.gov.in") && f.detail.includes("scholarshiphub.org")),
);
check(
  "gap mentions unread source",
  analysis.findings.some((f) => f.kind === "gap" && f.detail.toLowerCase().includes("could not be read")),
);
check(
  "passed deadline detected",
  analysis.findings.some((f) => f.kind === "outdated" && f.title.toLowerCase().includes("already passed")),
);
check(
  "old page detected",
  analysis.findings.some((f) => f.kind === "outdated" && f.detail.includes("2019-03-05")),
);

check("checklist non-empty", analysis.checklist.length >= 2, `${analysis.checklist.length}`);
check("has a high priority item", analysis.checklist.some((item) => item.priority === "High"));
check(
  "checklist starts with a conflict",
  analysis.checklist[0].text.toLowerCase().includes("conflict"),
  analysis.checklist[0].text,
);

check("evidence domain is official", analysis.evidence.domain === "nsp.gov.in", analysis.evidence.domain);
check(
  "evidence quote exists in source",
  official.text.includes(analysis.evidence.quote.replace(/\s+/g, " ")),
  analysis.evidence.quote.slice(0, 60),
);
check("evidence counts", analysis.evidence.sourceCount === 2 && analysis.evidence.quoteCount === 5);
check("status line reads well", analysis.statusLine.includes("2 of 3 sources read"), analysis.statusLine);

/* ---- degradation: the model dies mid-run, heuristics keep the product usable ---- */

const degraded = await analyze(
  { question: "What should I verify?", sources: [official, secondary], now },
  {
    decompose: async () => ({ aspects, fromModel: true }),
    extract: async () => {
      throw new Error("The Gemini quota is exhausted.");
    },
    audit: async () => [],
  },
);

check("degrades instead of crashing", degraded.diagnostics.claimsFromModel === false);
check("heuristic claims still verified", degraded.diagnostics.quotesVerified > 0, `${degraded.diagnostics.quotesVerified}`);
check("degraded run marked low confidence", degraded.analysis.reducedConfidence);
check(
  "degraded matrix still has coverage",
  degraded.analysis.cells.some((cell) => cell.state === "covered"),
);
check("model note recorded", degraded.diagnostics.modelNotes.some((note) => note.includes("claims:")));

console.log(failures === 0 ? "\nAll pipeline checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
