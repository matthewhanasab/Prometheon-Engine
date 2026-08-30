// Shared marketstack fetch: retry, backoff and a negative cache.
//
// This lived inside the research route until /api/stock-analysts needed the
// same behaviour and shipped without it — the analyst endpoints answered
// rate_limit_reached and, with no retry, the route returned empty ratings for
// every ticker while looking like a successful response. Divergent copies of
// this are how that happens, so there is one.
export type MsResult = { data: any; err: string | null };

const DAY = 86400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getOnce(url: string, ttl: number): Promise<MsResult> {
  try {
    const res = await fetch(url, { next: { revalidate: ttl } });
    const json = await res.json().catch(() => null);
    if (json && typeof json === "object" && "error" in json) {
      const e: any = (json as any).error;
      return { data: null, err: (e?.code || e?.message || String(e)) as string };
    }
    if (!res.ok) return { data: null, err: `HTTP ${res.status}` };
    return { data: json, err: null };
  } catch (e: any) {
    return { data: null, err: String(e?.message ?? e) };
  }
}

// Failed upstream calls are never stored in the Next.js data cache, so without
// this a rate-limited endpoint re-pays its full retry backoff on EVERY page
// load — including fully-cached ones. A short negative cache turns a failing
// endpoint into a fast miss instead of a multi-second stall.
const failCache: Map<string, number> =
  ((globalThis as any).__msFailCache ??= new Map<string, number>());
const FAIL_TTL = 90_000;

export async function msGet(url: string, ttl = DAY): Promise<MsResult> {
  const failedAt = failCache.get(url);
  if (failedAt && Date.now() - failedAt < FAIL_TTL) {
    return { data: null, err: "rate_limit_reached (recent, skipped)" };
  }
  let out = await getOnce(url, ttl);
  // marketstack enforces a strict per-second rate limit; short paced retries.
  for (let i = 0; i < 2 && out.err === "rate_limit_reached"; i++) {
    await sleep(1200 + i * 1300);
    out = await getOnce(url, ttl);
  }
  if (out.err === "rate_limit_reached") {
    // Bound the map: prune expired entries before it can grow without limit
    // under distinct-URL churn (many tickers hitting the limit).
    if (failCache.size > 2000) {
      const cutoff = Date.now() - FAIL_TTL;
      for (const [k, ts] of failCache) if (ts < cutoff) failCache.delete(k);
    }
    failCache.set(url, Date.now());
  } else {
    failCache.delete(url);
  }
  return out;
}

/** True when a result carries an upstream rate-limit error. */
export const hitRateLimit = (r: { err: string | null }): boolean =>
  typeof r?.err === "string" && r.err.startsWith("rate_limit_reached");
