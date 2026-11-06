import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import domainSnapshot from "@/data/logo-domains.json";

// Company logo, same-origin (canvas-safe for the share cards).
//
// A logo is the icon of the company's own website, so the work is: ticker ->
// website -> icon. The website comes from a weekly snapshot covering the S&P
// 500 and every large US listing (data/logo-domains.json); anything outside it
// falls back to marketstack's tickerinfo. Google's favicon service resolves a
// high-res icon for the domain, with DuckDuckGo's as a second source.
//
// Failures are split in two, because a page like the earnings calendar asks
// for fifty logos at once and upstreams throttle bursts:
//   - "this company has no logo" is a fact, cached for a day;
//   - "the lookup was throttled or timed out" is not, and is never cached, so
//     the next request (CompanyLogo retries once) gets a real answer.
// Caching the second kind for a day is what used to blank out logos.
export const revalidate = 86400;

const MS = "https://api.marketstack.com/v2";
const DOMAINS = (domainSnapshot as { domains: Record<string, string> }).domains ?? {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Icon = { res: Response } | "none" | "error";

async function fetchIcon(url: string): Promise<Icon> {
  try {
    const res = await fetch(url, { next: { revalidate: 604800 }, signal: AbortSignal.timeout(6000) });
    if (res.status === 404) return "none";
    if (!res.ok) return "error";
    const buf = await res.arrayBuffer();
    // Placeholder globes from these services are tiny; treat them as misses.
    if (buf.byteLength < 200) return "none";
    return {
      res: new NextResponse(buf, {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/png",
          // Logos change about as often as companies rebrand.
          "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        },
      }),
    };
  } catch {
    return "error";
  }
}

// A real miss is cached for a day: the only other outcome of an unknown
// symbol is a paid lookup per request.
const MISS = (why: string) => new NextResponse(null, {
  status: 404, headers: { "Cache-Control": "public, max-age=0, s-maxage=86400", "X-Logo-Miss": why },
});
// A transient failure must not be cached anywhere.
const RETRY = (why: string) => new NextResponse(null, {
  status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2", "X-Logo-Miss": why },
});

// Website host from marketstack, for tickers outside the snapshot. Throttled
// calls are retried briefly before giving up.
async function lookupDomain(t: string, key: string): Promise<string | "none" | "error"> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(250 * attempt + Math.random() * 250);
    try {
      const res = await fetch(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`, {
        next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000),
      });
      if (res.status === 429 || res.status >= 500) continue;
      const j = await res.json().catch(() => null);
      if (j?.error?.code === "rate_limit_reached" || j?.error?.code === "too_many_requests") continue;
      if (!res.ok) return "none";
      const info = Array.isArray(j?.data) ? j.data[0] : j?.data;
      const website: string | undefined = info?.website;
      if (!website) return "none";
      return new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    } catch { /* timeout or network: retry */ }
  }
  return "error";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  let domain: string | undefined = DOMAINS[t.replace(/[^A-Z0-9]/g, "")];

  // Snapshot hits cost nothing upstream but an icon fetch; the paid fallback
  // keeps its per-IP budget.
  const limited = guard(req, domain ? 1 : 2);
  if (limited) return limited;

  if (!domain) {
    const key = process.env.MARKETSTACK_KEY;
    if (!key) return MISS("no-website");
    const found = await lookupDomain(t, key);
    if (found === "error") return RETRY("lookup-throttled");
    if (found === "none") return MISS("no-website");
    domain = found;
  }

  const google = await fetchIcon(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  if (typeof google === "object") return google.res;
  const ddg = await fetchIcon(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  if (typeof ddg === "object") return ddg.res;
  return google === "error" || ddg === "error" ? RETRY("icon-throttled") : MISS("no-icon");
}
