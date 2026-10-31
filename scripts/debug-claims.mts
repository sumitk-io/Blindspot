import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { buildSnapshot } = await import("../lib/snapshot.ts");
const { buildClaimContext, decomposeAspects, extractClaims } = await import(
  "../lib/pipeline/model-stages.ts"
);

const question = process.argv[2] ?? "What should I verify before applying for a scholarship abroad?";
const urls = process.argv.slice(3).length
  ? process.argv.slice(3)
  : [
      "https://www.chevening.org/scholarships/",
      "https://en.wikipedia.org/wiki/Scholarship",
      "https://www.gatescambridge.org/",
    ];

const model = process.env.GEMINI_MODEL?.trim() || "(fallback chain)";
console.log(`model: ${model}\nquestion: ${question}\n`);

const snapshots = await Promise.all(urls.map((url) => buildSnapshot(url)));
for (const snapshot of snapshots) {
  console.log(
    `${snapshot.status} ${snapshot.domain.padEnd(22)} ${snapshot.text.split(/\s+/).length} words`,
  );
}

const { aspects, fromModel } = await decomposeAspects(question);
console.log(`\naspects (${fromModel ? "model" : "fallback"}):`);
for (const aspect of aspects) console.log(`  ${aspect.id.padEnd(24)} ${aspect.label}`);

const contexts = buildClaimContext(snapshots, aspects);
console.log("\ncontext sizes:");
for (const context of contexts) {
  console.log(`  ${context.snapshot.domain.padEnd(22)} ${context.excerpt.length} chars`);
}

if (process.env.DUMP_CONTEXT) {
  for (const context of contexts) {
    console.log(`\n===== ${context.snapshot.domain} excerpt =====`);
    console.log(context.excerpt.replace(/\n{3,}/g, "\n\n"));
  }
}

const started = Date.now();
const claims = await extractClaims(contexts, aspects, question);
console.log(`\nclaims: ${claims.length} in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

for (const claim of claims) {
  const domain = snapshots.find((snapshot) => snapshot.id === claim.sourceId)?.domain ?? claim.sourceId;
  console.log(`[${claim.aspectId}] ${domain}`);
  console.log(`  statement: ${claim.statement}`);
  console.log(`  quote:     ${claim.quote.replace(/\s+/g, " ").slice(0, 220)}`);
}

const perAspect = new Map<string, number>();
for (const claim of claims) perAspect.set(claim.aspectId, (perAspect.get(claim.aspectId) ?? 0) + 1);
console.log("\ncoverage of aspects:");
for (const aspect of aspects) {
  console.log(`  ${aspect.id.padEnd(24)} ${perAspect.get(aspect.id) ?? 0} claims`);
}
