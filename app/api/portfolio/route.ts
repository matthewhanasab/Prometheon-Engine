import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/fmp";

const FMP = "https://financialmodelingprep.com/stable";

async function fmpGet(path: string, params: Record<string, string>, revalidate = 1800) {
  const key = process.env.FMP_KEY ?? "";
  const url = new URL(`${FMP}${path}`);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// GET /api/portfolio?t=AAPL,MSFT,NVDA — per-ticker quote, profile, ratios, history, next earnings
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const tickers = Array.from(new Set(
    t.split(",").map(s => s.trim().toUpperCase()).filter(Boolean)
  )).slice(0, 25);
  if (tickers.length === 0) {
    return NextResponse.json({ error: "No tickers provided" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);

  try {
    const [holdings, spyHistory] = await Promise.all([
      Promise.all(tickers.map(async (sym) => {
        const [quoteRaw, profileRaw, ratiosRaw, history, earningsRaw] = await Promise.all([
          fmpGet("/quote", { symbol: sym }, 300),
          fmpGet("/profile", { symbol: sym }, 86400),
          fmpGet("/ratios-ttm", { symbol: sym }, 21600),
          getPriceHistory(sym, 365).catch(() => []),
          fmpGet("/earnings", { symbol: sym, limit: "6" }, 21600),
        ]);
        const q = Array.isArray(quoteRaw) ? quoteRaw[0] ?? {} : {};
        const p = Array.isArray(profileRaw) ? profileRaw[0] ?? {} : {};
        const r = Array.isArray(ratiosRaw) ? ratiosRaw[0] ?? {} : {};
        const futureEarnings = Array.isArray(earningsRaw)
          ? earningsRaw.map((e: any) => e.date).filter((d: string) => d && d >= today).sort()[0] ?? null
          : null;
        return {
          ticker: sym,
          name: q.name ?? p.companyName ?? sym,
          price: q.price ?? null,
          changePct: q.changePercentage ?? null,
          sector: p.sector ?? "Other",
          beta: p.beta ?? null,
          pe: r.priceToEarningsRatioTTM ?? null,
          divYield: r.dividendYieldTTM ?? null,
          nextEarnings: futureEarnings,
          history,
        };
      })),
      getPriceHistory("SPY", 365).catch(() => []),
    ]);

    return NextResponse.json({ holdings, spyHistory });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 });
  }
}
