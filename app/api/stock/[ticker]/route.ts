import { NextRequest, NextResponse } from "next/server";
import { getFullStockData, getPriceHistory, getEarnings } from "@/lib/fmp";
import { getFinnhubRecommendations, getFinnhubNews, getFinnhubPriceTarget } from "@/lib/finnhub";
import { getInsiderTrades } from "@/lib/sec";
import { get10YTreasury } from "@/lib/fred";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const [stock, price, earnings, recs, news, insiders, rf, priceTarget] = await Promise.all([
      getFullStockData(ticker),
      getPriceHistory(ticker, 365),
      getEarnings(ticker),
      getFinnhubRecommendations(ticker),
      getFinnhubNews(ticker),
      getInsiderTrades(ticker),
      get10YTreasury(),
      getFinnhubPriceTarget(ticker),
    ]);

    // Compute 1Y return from price history
    let return1Y: number | null = null;
    if (price.length >= 2 && stock.price != null) {
      return1Y = ((stock.price - price[0].price) / price[0].price) * 100;
    }

    // Merge Finnhub price target into stock object
    if (priceTarget && !stock.analystTarget) stock.analystTarget = priceTarget;
    return NextResponse.json({ stock, price, earnings, recs, news, insiders, rf, return1Y });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
