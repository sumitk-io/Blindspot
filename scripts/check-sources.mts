import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { buildSnapshot } = await import("../lib/snapshot.ts");

const urls = process.argv.slice(2);

for (const url of urls) {
  try {
    const snapshot = await buildSnapshot(url);
    const words = snapshot.text.split(/\s+/).filter(Boolean).length;
    const published = snapshot.publishedAt?.slice(0, 10) ?? "-";
    const confidence = snapshot.dateConfidence ?? "-";
    console.log(
      `${snapshot.status.padEnd(11)} ${String(words).padStart(5)}w  pub=${published} (${confidence})  ${url}`,
    );
    if (snapshot.status !== "ok") console.log(`            reason: ${snapshot.error ?? "unknown"}`);
  } catch (error) {
    console.log(`ERROR       ${url} :: ${(error as Error).message}`);
  }
}
