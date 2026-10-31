process.env.DAILY_ANALYSIS_CAP = "8";

const { rateLimit, resetRateLimits } = await import("../lib/rate-limit.ts");

resetRateLimits();

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  if (!condition) failures += 1;
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const t0 = Date.UTC(2026, 9, 31, 12, 0, 0);

const first = rateLimit("1.1.1.1", t0);
check("first request allowed", first.allowed && first.remaining === 4, `remaining=${first.remaining}`);

for (let i = 0; i < 4; i += 1) rateLimit("1.1.1.1", t0 + i);
const sixth = rateLimit("1.1.1.1", t0 + 5);
check("sixth request blocked", !sixth.allowed && sixth.reason === "per_ip", `${sixth.reason}`);
check("retry window reported", sixth.retryAfterSeconds > 3500, `${sixth.retryAfterSeconds}s`);

const other = rateLimit("2.2.2.2", t0 + 6);
check("other visitor unaffected", other.allowed, `${other.reason}`);

rateLimit("2.2.2.2", t0 + 7);
rateLimit("2.2.2.2", t0 + 8);
const capped = rateLimit("3.3.3.3", t0 + 9);
check("daily cap enforced", !capped.allowed && capped.reason === "daily", `${capped.reason}`);

// Next UTC day, more than an hour after the first burst: both the per-IP
// window and the daily counter must have reset.
const afterWindow = rateLimit("1.1.1.1", t0 + 25 * 60 * 60 * 1000);
check("hourly window and daily counter reset", afterWindow.allowed, `${afterWindow.reason}`);

check("remaining never negative", afterWindow.remaining >= 0);

console.log(failures === 0 ? "\nAll rate-limit checks passed." : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
