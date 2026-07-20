import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_KEY!;

async function get(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);

  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 5);
    const [infoRaw, holdingsRaw, sectorsRaw, countriesRaw, quoteRaw, pricesRaw, dividendsRaw] = await Promise.all([
      get("/etf/info", { symbol: t }),
      get("/etf/holdings", { symbol: t }),
      get("/etf/sector-weightings", { symbol: t }),
      get("/etf/country-weightings", { symbol: t }),
      get("/quote", { symbol: t }),
      get("/historical-price-eod/light", { symbol: t, from: from.toISOString().slice(0, 10) }),
      get("/dividends", { symbol: t, limit: "60" }),
    ]);

    const info = Array.isArray(infoRaw) ? infoRaw[0] ?? null : infoRaw ?? null;
    const q = Array.isArray(quoteRaw) ? quoteRaw[0] ?? null : quoteRaw ?? null;
    if (!info && !q) {
      return NextResponse.json({ error: "Not found — is this an ETF ticker?" }, { status: 404 });
    }

    // Holdings sorted by weight desc; keep the full list small on the wire
    const holdings = (Array.isArray(holdingsRaw) ? holdingsRaw : [])
      .filter((h: any) => h.asset && h.weightPercentage != null)
      .sort((a: any, b: any) => b.weightPercentage - a.weightPercentage)
      .slice(0, 100)
      .map((h: any) => ({
        asset: h.asset,
        name: h.name ?? "",
        weight: h.weightPercentage,
        shares: h.sharesNumber ?? null,
        marketValue: h.marketValue ?? null,
      }));

    const sectors = (Array.isArray(sectorsRaw) ? sectorsRaw : [])
      .map((s: any) => ({
        sector: s.sector,
        weight: typeof s.weightPercentage === "string" ? parseFloat(s.weightPercentage) : s.weightPercentage,
      }))
      .filter((s: any) => s.sector && isFinite(s.weight))
      .sort((a: any, b: any) => b.weight - a.weight);

    const countries = (Array.isArray(countriesRaw) ? countriesRaw : [])
      .map((c: any) => ({
        country: c.country,
        weight: typeof c.weightPercentage === "string" ? parseFloat(c.weightPercentage) : c.weightPercentage,
      }))
      .filter((c: any) => c.country && isFinite(c.weight))
      .sort((a: any, b: any) => b.weight - a.weight);

    // Price history ascending
    const prices: { date: string; price: number }[] = (Array.isArray(pricesRaw) ? pricesRaw : [])
      .map((r: any) => ({ date: r.date, price: r.price ?? 0 }))
      .reverse();

    // Dividends: recent payments + trailing-12-month sum for yield
    const divRows = (Array.isArray(dividendsRaw) ? dividendsRaw : [])
      .filter((d: any) => d.date && (d.adjDividend ?? d.dividend) != null);
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const ttmDividend = divRows
      .filter((d: any) => d.date >= cutoffStr)
      .reduce((s: number, d: any) => s + (d.adjDividend ?? d.dividend ?? 0), 0);
    const dividends = divRows.slice(0, 12).map((d: any) => ({
      date: d.date,
      paymentDate: d.paymentDate ?? null,
      amount: d.adjDividend ?? d.dividend,
      frequency: d.frequency ?? null,
    }));

    return NextResponse.json({
      ticker: t,
      quote: q ? {
        price: q.price ?? null,
        change: q.change ?? null,
        changePct: q.changePercentage ?? null,
        volume: q.volume ?? null,
        yearHigh: q.yearHigh ?? null,
        yearLow: q.yearLow ?? null,
        marketCap: q.marketCap ?? null,
        name: q.name ?? null,
      } : null,
      info: info ? {
        name: info.name ?? q?.name ?? t,
        description: info.description ?? null,
        expenseRatio: info.expenseRatio ?? null,
        aum: info.assetsUnderManagement ?? null,
        nav: info.nav ?? null,
        navCurrency: info.navCurrency ?? "USD",
        holdingsCount: info.holdingsCount ?? null,
        inceptionDate: info.inceptionDate ?? null,
        etfCompany: info.etfCompany ?? null,
        assetClass: info.assetClass ?? null,
        domicile: info.domicile ?? null,
        avgVolume: info.avgVolume ?? null,
        website: info.website ?? null,
      } : null,
      holdings,
      sectors,
      countries,
      prices,
      dividends,
      ttmDividend: ttmDividend > 0 ? ttmDividend : null,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch ETF data" }, { status: 500 });
  }
}
