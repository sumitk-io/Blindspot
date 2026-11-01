import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { safeFetch } = await import("../lib/safe-fetch.ts");
const { buildSnapshot } = await import("../lib/snapshot.ts");

const urls = [
  "https://example.com",
  "https://en.wikipedia.org/wiki/Scholarship",
  "https://www.gatescambridge.org/apply/how-to-apply/",
  ...process.argv.slice(2),
];

for (const url of urls) {
  const started = Date.now();
  try {
    const fetched = await safeFetch(url);
    console.log(
      `FETCH ok   ${String(Date.now() - started).padStart(5)}ms  ${fetched.contentType} ${fetched.bytes}b  ${url}`,
    );
  } catch (error) {
    const code = (error as { code?: string }).code ?? "?";
    console.log(
      `FETCH FAIL ${String(Date.now() - started).padStart(5)}ms  [${code}] ${(error as Error).message}  ${url}`,
    );
  }

  const started2 = Date.now();
  try {
    const snapshot = await buildSnapshot(url);
    const words = snapshot.text ? snapshot.text.split(/\s+/).filter(Boolean).length : 0;
    console.log(
      `SNAP  ${snapshot.status.padEnd(6)} ${String(Date.now() - started2).padStart(5)}ms  ${String(words).padStart(5)}w  ${snapshot.status === "ok" ? "" : `[${snapshot.errorCode}] ${snapshot.errorMessage}`}`,
    );
  } catch (error) {
    console.log(`SNAP  THREW  ${(error as Error).message}`);
  }
  console.log("");
}
