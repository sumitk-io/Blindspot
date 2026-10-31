/**
 * Run the real pipeline against a fixed set of sources and freeze the result
 * as the saved demo. Usage:
 *   npx tsx scripts/save-demo.mts
 *   npx tsx scripts/save-demo.mts "Your question" https://a.example https://b.example
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { writeFileSync } = await import("node:fs");
const { buildSnapshot } = await import("../lib/snapshot.ts");
const { analyze } = await import("../lib/pipeline/analyze.ts");

const question =
  process.argv[2]?.trim() ||
  "What should I verify before applying for a scholarship abroad?";

const urls =
  process.argv.slice(3).length > 0
    ? process.argv.slice(3)
    : [
        "https://www.chevening.org/scholarships/",
        "https://en.wikipedia.org/wiki/Scholarship",
        "https://www.gatescambridge.org/",
      ];

console.log(`Question: ${question}`);
console.log(`Sources: ${urls.length}`);

const snapshots = [];
for (const url of urls) {
  const snapshot = await buildSnapshot(url);
  console.log(
    `  ${snapshot.status.toUpperCase().padEnd(6)} ${snapshot.domain.padEnd(24)} ${
      snapshot.text ? snapshot.text.split(/\s+/).length : 0
    } words ${snapshot.errorCode ?? ""}`,
  );
  snapshots.push(snapshot);
}

const result = await analyze({ question, sources: snapshots });
const payload = {
  savedAt: new Date().toISOString(),
  ...result.analysis,
  diagnostics: result.diagnostics,
};

const target = new URL("../lib/demo-saved.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log("\nSaved to lib/demo-saved.json");
console.log(`  cells        ${result.analysis.cells.length}`);
console.log(`  findings     ${result.analysis.findings.length}`);
console.log(`  checklist    ${result.analysis.checklist.length}`);
console.log(`  quotes       ${result.diagnostics.quotesVerified} verified, ${result.diagnostics.quotesRejected} rejected`);
console.log(`  status       ${result.analysis.statusLine}`);
if (result.diagnostics.modelNotes.length > 0) {
  console.log(`  notes        ${result.diagnostics.modelNotes.join(" | ")}`);
}
