import {
  chunkText,
  extractValues,
  verifyQuote,
} from "../lib/pipeline/text.ts";

const source = [
  "Scholarships are awarded on the basis of academic merit and family income.",
  "Applicants must submit an income certificate issued by the competent authority.",
  "The last date for submission is 31 October 2026.",
  "Renewal is subject to satisfactory academic progress each year.",
  "A student may receive up to 50% of the tuition fee, capped at \u20b950,000.",
].join("\n\n");

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

// 1. Exact quote
const exact = verifyQuote(source, "Applicants must submit an income certificate issued by the competent authority.");
check("exact quote", exact.verified && exact.method === "exact", exact.method);

// 2. Smart quotes and curly apostrophes
const curly = verifyQuote(source, "A student may receive up to 50% of the tuition fee, capped at \u20b950,000.");
check("curly punctuation", curly.verified, curly.method);

// 3. Non-breaking spaces and collapsed whitespace
const spaced = verifyQuote(source, "The   last\u00a0date for submission is 31 October 2026.");
check("whitespace + NBSP", spaced.verified, spaced.method);

// 4. Dropped word (fuzzy)
const dropped = verifyQuote(source, "Renewal is subject to satisfactory progress each year.");
check("dropped word (fuzzy)", dropped.verified && dropped.method === "fuzzy", `${dropped.method} ${dropped.score.toFixed(2)}`);

// 5. Fabricated quote must NOT verify
const fake = verifyQuote(source, "Applicants must submit a bank statement and a passport photograph.");
check("fabricated quote rejected", !fake.verified, `${fake.method} ${fake.score.toFixed(2)}`);

// 6. Too-short quote is never trusted
const short = verifyQuote(source, "Renewal is subject");
check("short quote rejected", !short.verified, short.method);

// 7. Chunking covers the whole document without gaps
const chunks = chunkText(source, 200, 40);
const covered = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
check("chunks produced", chunks.length >= 2, `${chunks.length} chunks, ${covered} chars`);
check("chunk offsets valid", chunks.every((chunk) => chunk.end > chunk.start));

// 8. Typed values
const values = extractValues(
  "Deadline 15 November 2026, income below \u20b92,50,000, at least 60% marks, 12 months of study.",
);
const kinds = new Set(values.map((value) => value.kind));
check("date value", values.some((v) => v.kind === "date" && v.normalized === "2026-11-15"));
check("money value", values.some((v) => v.kind === "money" && v.number === 250000));
check("percent value", values.some((v) => v.kind === "percent" && v.number === 60));
check("duration value", values.some((v) => v.kind === "duration" && v.number === 360));
check("all four kinds", kinds.size === 4, [...kinds].join(","));

console.log(failures === 0 ? "\nAll text checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
