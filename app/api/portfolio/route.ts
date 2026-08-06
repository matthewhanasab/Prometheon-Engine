import { NextRequest, NextResponse } from "next/server";

// Portfolio holdings feed, sourced from this site's own aggregator endpoints
// (marketstack prices/ratings + SEC EDGAR fundamentals + FRED). One source of
// truth: a holding here shows the same P/E and beta as its research page.
//
// GET /api/portfolio?t=AAPL,MSFT,NVDA
export async function GET(req: NextRequest) {
  const t = (req.nextUrl.searchParams.get("t") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, ""))
    .filter(Boolean)
    .slice(0, 25);
  if (!t.length) return NextResponse.json({ holdings: [], spyHistory: [] });

  const origin = req.nextUrl.origin;
  const yearAgo = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);

  const grab = async (sym: string) => {
    try {
      const [stockRes, optRes] = await Promise.all([
        fetch(`${origin}/api/marketstack-stock/${sym}`),
        fetch(`${origin}/api/ms-options/${sym}`),
      ]);
      const s = await stockRes.json();
      if (!stockRes.ok || s.error) return null;
      const o = optRes.ok ? await optRes.json() : {};
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
        // Projected from SEC filing cadence — an estimate, not a confirmed date.
        nextEarnings: o.nextEarnings ?? null,
        history,
      };
    } catch {
      return null;
    }
  };

  try {
    const [holdingsRaw, spyRes] = await Promise.all([
      Promise.all(t.map(grab)),
      fetch(`${origin}/api/marketstack-stock/SPY`),
    ]);
    let spyHistory: { date: string; price: number }[] = [];
    try {
      const spy = await spyRes.json();
      spyHistory = (spy.price ?? [])
        .filter((p: any) => p.date >= yearAgo)
        .map((p: any) => ({ date: p.date, price: p.price }));
    } catch { /* benchmark race simply hides */ }

    return NextResponse.json({ holdings: holdingsRaw.filter(Boolean), spyHistory });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 });
  }
}
