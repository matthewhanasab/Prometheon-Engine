import { NextRequest, NextResponse } from "next/server";
import { GET as etfGET } from "@/app/api/etf/[ticker]/route";
import { guard } from "@/lib/rateLimit";

// ETF comparison. Side-by-side stats plus the headline feature: holdings
// OVERLAP — for every pair, the share of net assets invested in the same
// securities (Σ min(weightA, weightB) matched by CUSIP). Two S&P 500 funds
// overlap ~100%; VOO vs a dividend fund far less. Answers "am I actually
// diversifying, or buying the same basket twice?"
//
// The per-ETF handler is called in-process (no HTTP hop → no self-throttle,
// no SSRF, no amplification), same pattern as the portfolio aggregator.
const MAX = 4;

async function loadEtf(ticker: string): Promise<any | null> {
  try {
    const req = new NextRequest(`https://internal.local/api/etf/${ticker}?full=1`);
    const res = await etfGET(req, { params: Promise.resolve({ ticker }) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.error ? null : j;
  } catch {
    return null;
  }
}

/** Σ min(weightA, weightB) over securities present in both, matched by id. */
function overlap(a: any[], b: any[]): number {
  if (!a?.length || !b?.length) return 0;
  const bw = new Map<string, number>();
  for (const h of b) bw.set(h.id, (bw.get(h.id) ?? 0) + h.weightPct);
  let shared = 0;
  const seen = new Set<string>();
  for (const h of a) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const other = bw.get(h.id);
    if (other != null) shared += Math.min(h.weightPct, other);
  }
  return shared;
}

export async function GET(req: NextRequest) {
  const limited = guard(req, 16);
  if (limited) return limited;

  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const raw of (req.nextUrl.searchParams.get("t") ?? "").split(",")) {
    const s = raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
    if (s && !seen.has(s)) { seen.add(s); tickers.push(s); }
    if (tickers.length >= MAX) break;
  }
  if (tickers.length < 2) {
    return NextResponse.json({ error: "Enter at least two ETF tickers." }, { status: 400 });
  }

  const loaded = await Promise.all(tickers.map(loadEtf));
  const funds = tickers.map((ticker, i) => {
    const d = loaded[i];
    if (!d) return { ticker, error: "not found" };
    return {
      ticker,
      name: d.quote?.name ?? ticker,
      holdingsAvailable: !!d.holdingsAvailable,
      price: d.quote?.price ?? null,
      yieldPct: d.quote?.yieldPct ?? null,
      expenseRatio: d.quote?.expenseRatio ?? null,
      netYieldPct: d.quote?.netYieldPct ?? null,
      returns: d.quote?.returns ?? [],
      chart: d.quote?.chart ?? [],
      netAssets: d.totals?.netAssets ?? null,
      count: d.totals?.count ?? null,
      effectiveHoldings: d.totals?.effectiveHoldings ?? null,
      top10Weight: d.totals?.top10Weight ?? null,
      largestWeight: d.totals?.largestWeight ?? null,
      onLoanPct: d.totals?.onLoanPct ?? null,
      top: (d.top ?? []).slice(0, 10).map((h: any) => ({ name: h.name, weightPct: h.weightPct })),
      countries: d.countries ?? [],
      _full: d.full ?? [],
      reportDate: d.fund?.reportDate ?? null,
    };
  });

  // Pairwise overlap matrix over funds that actually have holdings.
  const overlaps: { a: string; b: string; pct: number }[] = [];
  for (let i = 0; i < funds.length; i++) {
    for (let j = i + 1; j < funds.length; j++) {
      const fa = funds[i], fb = funds[j];
      if (fa.holdingsAvailable && fb.holdingsAvailable) {
        overlaps.push({ a: fa.ticker, b: fb.ticker, pct: overlap(fa._full, fb._full) });
      }
    }
  }

  // Strip the heavy full-holdings arrays before returning.
  funds.forEach((f: any) => delete f._full);

  return NextResponse.json({ funds, overlaps }, {
    // Assembling this means a full holdings pull per fund plus the pairwise
    // overlap, which measured ~8s uncached — and the route was returning
    // must-revalidate, so every visitor paid it. Holdings are published daily
    // and the returns are computed off end-of-day closes, so an edge cache adds
    // no staleness the data doesn't already have.
    headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
