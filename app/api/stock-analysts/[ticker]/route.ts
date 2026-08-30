import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { fetchConsensusEps } from "@/lib/analystEstimates";
import { msGet } from "@/lib/marketstack";

// Analyst view for a ticker: price-target consensus, the rating list, and
// forward multiples off consensus EPS.
//
// Split out of /api/marketstack-stock because these two calls were the whole
// reason an uncached research load took ~5s. Measured on production with
// per-stage timings, on cold tickers:
//
//   ratings (marketstack companyratings)  ~3,800ms   <- the long pole
//   consensus (analyst EPS)               ~2,200ms
//   everything else                         ~600ms each, in parallel
//
// Nothing above the fold needs either of them. Price, chart, returns and every
// SEC-derived fundamental stand on their own, so blocking the entire payload on
// the slowest upstream endpoint in the stack meant the fast 90% waited for the
// slow 10%. The page now paints from the main route and fills these in when
// they land — the same treatment ETF ownership already gets.
const MS = "https://api.marketstack.com/v2";
const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function decode(s: unknown): unknown {
  if (typeof s !== "string") return s;
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 8);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });

  // The last close is needed for forward P/E. It's the same URL the main route
  // already fetched for this ticker, so by the time the page asks for this it
  // is a data-cache hit rather than a real call.
  const since = new Date();
  since.setFullYear(since.getFullYear() - 5);
  const eodUrl = key
    ? `${MS}/eod?access_key=${key}&symbols=${t}&date_from=${since.toISOString().slice(0, 10)}&limit=1400`
    : null;

  const [ratingsRes, estimate, eodRes] = await Promise.all([
    key ? msGet(`${MS}/companyratings?access_key=${key}&ticker=${t}`) : Promise.resolve({ data: null, err: "no key" }),
    fetchConsensusEps(t).catch(() => null),
    eodUrl ? msGet(eodUrl) : Promise.resolve({ data: null, err: "no key" }),
  ]);

  const ratingsOut = (ratingsRes.data as any)?.result?.output;
  const cons = ratingsOut?.analyst_consensus;
  const analystList = Array.isArray(ratingsOut?.analysts) ? ratingsOut.analysts : [];

  const consensus = cons
    ? {
        avgTarget: num(cons.analyst_average),
        highTarget: num(cons.analyst_highest),
        lowTarget: num(cons.analyst_lowest),
        analysts: num(cons.analysts_number),
        buy: num(cons.buy) ?? 0,
        hold: num(cons.hold) ?? 0,
        sell: num(cons.sell) ?? 0,
        asOf: cons.consensus_date ?? null,
      }
    : null;

  const analysts = analystList.map((a: Record<string, any>) => ({
    name: decode(a?.analyst_name) ?? null,
    firm: decode(a?.analyst_firm) ?? null,
    rating: a?.rating?.rated ?? null,
    action: a?.rating?.conclusion ?? null,
    target: num(a?.rating?.price_target),
    date: a?.rating?.date_rating ?? null,
  }));

  const eodRows: unknown[] = Array.isArray((eodRes.data as any)?.data) ? (eodRes.data as any).data : [];
  const lastClose = eodRows.map((r) => Number((r as { close?: unknown })?.close)).find((c) => Number.isFinite(c) && c > 0) ?? null;

  const consensusForward = estimate
    ? {
        ...estimate,
        pe:
          estimate.ntmEps != null && estimate.ntmEps > 0 && lastClose
            ? lastClose / estimate.ntmEps
            : null,
      }
    : null;

  // A rate-limited ratings call must NOT be cached for an hour. marketstack
  // answers rate_limit_reached under load, and with the full window a single
  // unlucky request freezes "no analyst data" into the edge for everyone until
  // it expires — which is what made AAPL and KO look permanently empty while
  // MSFT and NVDA were fine. A short window lets the next request try again.
  const degraded = !consensus || ratingsRes.err != null;
  return NextResponse.json(
    { ticker: t, consensus, analysts, consensusForward, degraded, errors: { ratings: ratingsRes.err } },
    {
      headers: {
        "Cache-Control": degraded
          ? "public, max-age=0, s-maxage=30"
          : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
  );
}
