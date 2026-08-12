import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { ETF_UNIVERSE, normalizeCompanyName } from "@/lib/etfHoldingsIndex";

// "Which ETFs hold this stock?" — the reverse of the ETF holdings page.
//
// Every fund in the universe is fetched whole and scanned for the company. That
// sounds expensive but isn't: the URLs are identical for every stock a user
// looks up, so Next's data cache serves them for 24h and the upstream cost is a
// couple of dozen calls per day in total, not per request.
//
// The research page loads this lazily, after its main payload, so a cold scan
// never delays the page itself.
const MS = "https://api.marketstack.com/v2";

// Scanning the universe means a burst of parallel calls, which reliably trips
// marketstack's per-second limiter. Without this retry the throttled funds come
// back empty and silently vanish from the results — the stock looks like it
// isn't held by ETFs that in fact hold it heavily.
async function get(url: string, ttl: number, tries = 3): Promise<any> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { next: { revalidate: ttl } });
      const json = await res.json().catch(() => null);
      if (json?.error?.code === "rate_limit_reached" && attempt < tries - 1) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      return json;
    } catch {
      if (attempt === tries - 1) return null;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return null;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

const numOf = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 10);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  // The caller can pass the company name it already has and save a round-trip.
  let name = (req.nextUrl.searchParams.get("name") ?? "").slice(0, 120);
  if (!name) {
    const info = await get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`, 86400);
    const row = Array.isArray(info?.data) ? info.data[0] : info?.data;
    name = typeof row?.name === "string" ? row.name : "";
  }
  const wanted = normalizeCompanyName(name);
  if (!wanted) {
    return NextResponse.json({
      ticker: t, name: null, matches: [], scanned: 0,
      reason: "No company name available to match against fund holdings.",
    });
  }

  let scanned = 0;
  const results = await pool(ETF_UNIVERSE, 3, async (fund) => {
    const raw = await get(`${MS}/etfholdings?access_key=${key}&ticker=${fund.ticker}`, 86400);
    const out = raw?.output;
    const holdings = out?.holdings;
    if (!Array.isArray(holdings) || !holdings.length) return null;
    scanned++;

    // A company can appear more than once (multiple share classes); sum them so
    // the reported weight is the fund's true exposure to the business.
    let weightPct = 0;
    let valueUsd = 0;
    let matched = false;
    for (const h of holdings) {
      const s = h.investment_security ?? h;
      if (normalizeCompanyName(s?.name) !== wanted) continue;
      matched = true;
      weightPct += numOf(s.percent_value); // already a percentage of net assets
      valueUsd += numOf(s.value_usd);
    }
    if (!matched) return null;

    // Rank within the fund — "the 3rd largest position" is the interesting part.
    const ranked = holdings
      .map((h: any) => numOf((h.investment_security ?? h).value_usd))
      .sort((a: number, b: number) => b - a);
    const rank = ranked.findIndex((v: number) => v <= valueUsd) + 1;

    return {
      ...fund,
      weightPct,
      valueUsd,
      rank: rank > 0 ? rank : null,
      holdingsCount: holdings.length,
      reportDate: out?.attributes?.date_report_period ?? null,
    };
  });

  const matches = results
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => b.weightPct - a.weightPct);

  return NextResponse.json(
    // `scanned` counts funds that actually returned holdings, so the UI can say
    // "found in 6 of 27 funds scanned" truthfully.
    { ticker: t, name, matches, universe: ETF_UNIVERSE.length, scanned },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=43200, stale-while-revalidate=86400" } }
  );
}
