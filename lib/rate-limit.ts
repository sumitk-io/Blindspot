/**
 * Best-effort rate limiting for the shared (owner-provided) API key.
 *
 * State lives in the server process, so on a multi-instance deployment the
 * effective limit is per instance. That is acceptable here: the goal is to stop
 * a single visitor from draining the key, not to enforce a global quota.
 */

const WINDOW_MS = 60 * 60 * 1000;
const PER_IP_LIMIT = 5;
const DAILY_LIMIT = Number(process.env.DAILY_ANALYSIS_CAP ?? 200);

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let dayKey = "";
let dayCount = 0;

function currentDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((hit) => now - hit < WINDOW_MS);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export type RateLimitReason = "ok" | "per_ip" | "daily";

export interface RateLimitResult {
  allowed: boolean;
  reason: RateLimitReason;
  remaining: number;
  retryAfterSeconds: number;
  dailyRemaining: number;
}

export function rateLimit(ip: string, now = Date.now()): RateLimitResult {
  prune(now);

  const today = currentDay(now);
  if (today !== dayKey) {
    dayKey = today;
    dayCount = 0;
  }

  const bucket = buckets.get(ip) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((hit) => now - hit < WINDOW_MS);

  if (dayCount >= DAILY_LIMIT) {
    const midnight = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate() + 1,
    );
    return {
      allowed: false,
      reason: "daily",
      remaining: Math.max(0, PER_IP_LIMIT - bucket.hits.length),
      retryAfterSeconds: Math.max(60, Math.ceil((midnight - now) / 1000)),
      dailyRemaining: 0,
    };
  }

  if (bucket.hits.length >= PER_IP_LIMIT) {
    const oldest = bucket.hits[0];
    buckets.set(ip, bucket);
    return {
      allowed: false,
      reason: "per_ip",
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)),
      dailyRemaining: Math.max(0, DAILY_LIMIT - dayCount),
    };
  }

  bucket.hits.push(now);
  buckets.set(ip, bucket);
  dayCount += 1;

  return {
    allowed: true,
    reason: "ok",
    remaining: Math.max(0, PER_IP_LIMIT - bucket.hits.length),
    retryAfterSeconds: 0,
    dailyRemaining: Math.max(0, DAILY_LIMIT - dayCount),
  };
}

/** Only used by tests. */
export function resetRateLimits() {
  buckets.clear();
  dayKey = "";
  dayCount = 0;
}
