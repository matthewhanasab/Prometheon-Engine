import { NextRequest, NextResponse } from "next/server";
import { getFullStockData } from "@/lib/fmp";

export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const tickers = t.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 4);
  if (tickers.length < 2) {
    return NextResponse.json({ error: "Provide at least 2 tickers via ?t=AAPL,MSFT" }, { status: 400 });
  }
  try {
    const stocks = await Promise.all(tickers.map(ticker => getFullStockData(ticker)));
    return NextResponse.json(stocks);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch comparison data" }, { status: 500 });
  }
}
