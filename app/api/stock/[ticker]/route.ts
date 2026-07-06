import { NextRequest, NextResponse } from "next/server";
import { getFullStockData, getPriceHistory, getEarnings } from "@/lib/fmp";
import { getFinnhubRecommendations, getFinnhubNews, getFinnhubPriceTarget } from "@/lib/finnhub";
import { getInsiderTrades } from "@/lib/sec";
import { get10YTreasury } from "@/lib/fred";

const FMP_BASE = "https://financialmodelingprep.com/stable";

async function getInstitutionalHolders(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/institutional-holder?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 10) : [];
  } catch { return []; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const [stock, price, earnings, recs, news, insiders, rf, priceTarget, institutional] = await Promise.all([
      getFullStockData(ticker),
      getPriceHistory(ticker, 365),
      getEarnings(ticker),
      getFinnhubRecommendations(ticker),
      getFinnhubNews(ticker),
      getInsiderTrades(ticker),
      get10YTreasury(),
      getFinnhubPriceTarget(ticker),
      getInstitutionalHolders(ticker),
    ]);

    // Compute 1Y return from price history
    let return1Y: number | null = null;
    if (price.length >= 2 && stock.price != null) {
      return1Y = ((stock.price - price[0].price) / price[0].price) * 100;
    }

    // Merge Finnhub price target into stock object
    if (priceTarget && !stock.analystTarget) (stock as any).analystTarget = priceTarget;
    return NextResponse.json({ stock, price, earnings, recs, news, insiders, rf, return1Y, institutional });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
