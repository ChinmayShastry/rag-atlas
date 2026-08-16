/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately dependency-free. On serverless each instance keeps its own
 * counters and they reset on cold start, so this is a speed bump against
 * casual scripted abuse rather than a hard guarantee. The real ceiling is the
 * spend limit set on the OpenAI account.
 *
 * Only applied to requests that spend the *server's* key — a visitor using
 * their own key is paying their own bill and is left alone.
 */

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

/** Drop stale buckets so the map cannot grow without bound. */
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const live = hits.filter((t) => now - t < windowMs);
    if (live.length === 0) buckets.delete(key);
    else buckets.set(key, live);
  }
}

export interface RateVerdict {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  identity: string,
  limit: number,
  windowMs = 3_600_000,
): RateVerdict {
  const now = Date.now();
  sweep(now, windowMs);

  const hits = (buckets.get(identity) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const oldest = Math.min(...hits);
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(identity, hits);
  return { ok: true, remaining: limit - hits.length, retryAfterSeconds: 0 };
}

/** Best-effort client identity behind Vercel's proxy. */
export function clientId(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0].trim() : (req.headers.get("x-real-ip") ?? "unknown");
  return `${scope}:${ip}`;
}

export function tooMany(verdict: RateVerdict) {
  const minutes = Math.ceil(verdict.retryAfterSeconds / 60);
  return Response.json(
    {
      error: `Rate limit reached on the shared demo key. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}, or enter your own OpenAI key to remove the limit entirely.`,
    },
    {
      status: 429,
      headers: { "Retry-After": String(verdict.retryAfterSeconds) },
    },
  );
}
