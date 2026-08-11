import { NextRequest, NextResponse } from "next/server";
import { GET as stockGET } from "@/app/api/marketstack-stock/[ticker]/route";
import { GET as optionsGET } from "@/app/api/ms-options/[ticker]/route";
import { guard } from "@/lib/rateLimit";

// Portfolio holdings feed, sourced from this site's own aggregators
// (marketstack prices/ratings + SEC EDGAR fundamentals + FRED). One source of
// truth: a holding here shows the same P/E and beta as its research page.
//
// The per-ticker aggregators are invoked IN-PROCESS rather than over HTTP.
// Fetching our own API across the network would (a) re-enter the rate limiter
// under the server's IP and throttle a large portfolio into partial data,
// (b) let a spoofed Host header steer the fetch (SSRF), and (c) multiply load.
// A direct function call avoids all three.
//
// GET /api/portfolio?t=AAPL,MSFT,NVDA
const MAX_HOLDINGS = 12;
const CONCURRENCY = 3;

async function callHandler(
  handler: (req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) => Promise<Response>,
  ticker: string
): Promise<any | null> {
  try {
    const req = new NextRequest(`https://internal.local/api/x/${ticker}`);
    const res = await handler(req, { params: Promise.resolve({ ticker }) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.error ? null : j;
  } catch {
    return null;
  }
}

/** Resolve jobs with a bounded worker pool so a big list can't stampede. */
async function pool<T>(items: string[], limit: number, fn: (t: string) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

export async function GET(req: NextRequest) {
  // High cost: one request fans out across every holding. The internal handler
  // calls below are constructed with the internal.local host and are exempt.
  const limited = guard(req, 40);
  if (limited) return limited;

  const seen = new Set<string>();
  const t: string[] = [];
  for (const raw of (req.nextUrl.searchParams.get("t") ?? "").split(",")) {
    const sym = raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
    if (sym && !seen.has(sym)) { seen.add(sym); t.push(sym); }
    if (t.length >= MAX_HOLDINGS) break;
  }
  if (!t.length) return NextResponse.json({ holdings: [], spyHistory: [] });

  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

  const grab = async (sym: string) => {
    const s = await callHandler(stockGET, sym);
    if (!s) return null;
    const o = (await callHandler(optionsGET, sym)) ?? {};
    const history = (s.price ?? [])
      .filter((p: any) => p.date >= yearAgo)
      .map((p: any) => ({ date: p.date, price: p.price }));
    return {
      ticker: sym,
      name: s.profile?.name ?? sym,
      price: s.quote?.price ?? null,
      changePct: s.quote?.changePct ?? null,
      sector: s.profile?.sector ?? "Other",
      beta: s.capm?.beta ?? null,
      pe: s.fundamentals?.peRatio ?? null,
      divYield: s.dividends?.yieldPct != null ? s.dividends.yieldPct / 100 : null,
      nextEarnings: o.nextEarnings ?? null,
      history,
    };
  };

  try {
    const [holdingsRaw, spy] = await Promise.all([
      pool(t, CONCURRENCY, grab),
      callHandler(stockGET, "SPY"),
    ]);
    const spyHistory = (spy?.price ?? [])
      .filter((p: any) => p.date >= yearAgo)
      .map((p: any) => ({ date: p.date, price: p.price }));

    return NextResponse.json({ holdings: holdingsRaw.filter(Boolean), spyHistory });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 });
  }
}
