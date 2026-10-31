import { buildSnapshot } from "../lib/snapshot.ts";

const urls = [
  "https://en.wikipedia.org/wiki/Scholarship",
  "https://example.com",
  "https://www.nsp.gov.in",
  "https://en.wikipedia.org/wiki/This_page_does_not_exist_404_test",
];

for (const url of urls) {
  const snapshot = await buildSnapshot(url);
  const words = snapshot.text ? snapshot.text.split(/\s+/).length : 0;
  console.log(`\n${snapshot.status.toUpperCase()}  ${snapshot.domain}`);
  console.log(`  title      ${snapshot.title.slice(0, 70)}`);
  console.log(`  words      ${words}   bytes ${snapshot.bytes}   truncated ${snapshot.truncated}`);
  console.log(
    `  published  ${snapshot.publishedAt ?? "none"}   confidence ${snapshot.dateConfidence}`,
  );
  console.log(`  sha256     ${snapshot.sha256.slice(0, 16) || "-"}`);
  if (snapshot.errorCode) console.log(`  error      ${snapshot.errorCode} — ${snapshot.errorMessage}`);
  console.log(`  excerpt    ${snapshot.text.slice(0, 110).replace(/\s+/g, " ")}`);
}
