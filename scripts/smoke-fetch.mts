import { FetchError, safeFetch } from "../lib/safe-fetch.ts";

type Case = {
  label: string;
  url: string;
  expect: "ok" | string;
};

const cases: Case[] = [
  { label: "public page", url: "https://example.com", expect: "ok" },
  { label: "public page with path", url: "https://en.wikipedia.org/wiki/Scholarship", expect: "ok" },
  { label: "loopback", url: "http://localhost/", expect: "BLOCKED_HOST" },
  { label: "loopback with port", url: "http://localhost:3000", expect: "BLOCKED_PORT" },
  { label: "cloud metadata", url: "http://169.254.169.254/latest/meta-data", expect: "BLOCKED_HOST" },
  { label: "private range", url: "http://192.168.1.10/admin", expect: "BLOCKED_HOST" },
  { label: "javascript scheme", url: "javascript:alert(1)", expect: "UNSUPPORTED_SCHEME" },
  { label: "file scheme", url: "file:///C:/Windows/win.ini", expect: "UNSUPPORTED_SCHEME" },
  { label: "credentials in url", url: "https://user:pass@example.com", expect: "CREDENTIALS_IN_URL" },
  { label: "bad port", url: "https://example.com:8080/", expect: "BLOCKED_PORT" },
  { label: "not a url", url: "hello there", expect: "INVALID_URL" },
  { label: "404", url: "https://example.com/definitely-not-a-page", expect: "HTTP_ERROR" },
];

let failures = 0;

for (const testCase of cases) {
  try {
    const result = await safeFetch(testCase.url, { timeoutMs: 12_000 });
    const ok = testCase.expect === "ok" && result.text.length > 0;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${testCase.label.padEnd(24)} ${result.status} ${result.bytes}B ${result.finalUrl}`,
    );
  } catch (error) {
    const code = error instanceof FetchError ? error.code : "UNEXPECTED";
    const ok = code === testCase.expect;
    if (!ok) failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`${ok ? "PASS" : "FAIL"}  ${testCase.label.padEnd(24)} ${code} — ${message}`);
  }
}

console.log(failures === 0 ? "\nAll guard cases behaved as expected." : `\n${failures} case(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
