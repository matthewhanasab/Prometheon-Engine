import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_KEY!;

async function fmpGet(path: string, params: Record<string, string> = {}) {
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
  const t = ticker.toUpperCase();

  try {
    const from = new Date();
    from.setFullYear(from.getFullYear() - 6);
    const [income, cashflow, balance, profile, productSegsRaw, geoSegsRaw, estimates, pricesRaw] = await Promise.all([
      fmpGet("/income-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/cash-flow-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/balance-sheet-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/profile", { symbol: t }),
      fmpGet("/revenue-product-segmentation", { symbol: t }),
      fmpGet("/revenue-geographic-segmentation", { symbol: t }),
      fmpGet("/analyst-estimates", { symbol: t, period: "quarter", limit: "16" }),
      fmpGet("/historical-price-eod/light", { symbol: t, from: from.toISOString().slice(0, 10) }),
    ]);

    // Weekly closes are plenty for quarter-end PE lookups; keeps the payload small
    const prices: { date: string; price: number }[] = [];
    if (Array.isArray(pricesRaw)) {
      const seen = new Set<string>();
      for (const r of pricesRaw) { // newest-first; keep first row per ISO week
        const d = new Date(r.date);
        const wk = `${d.getFullYear()}-${Math.floor(d.getTime() / (7 * 86400000))}`;
        if (seen.has(wk)) continue;
        seen.add(wk);
        prices.push({ date: r.date, price: r.price ?? 0 });
      }
      prices.reverse();
    }

    return NextResponse.json({
      income:          income          ?? [],
      cashflow:        cashflow        ?? [],
      balance:         balance         ?? [],
      profile:         Array.isArray(profile) ? profile[0] : (profile ?? {}),
      productSegments: Array.isArray(productSegsRaw) ? productSegsRaw : [],
      geoSegments:     Array.isArray(geoSegsRaw)     ? geoSegsRaw     : [],
      estimates:       Array.isArray(estimates)      ? estimates      : [],
      prices,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch charts data" }, { status: 500 });
  }
}
