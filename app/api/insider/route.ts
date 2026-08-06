import { NextRequest, NextResponse } from "next/server";
import { getInsiderTrades } from "@/lib/sec";

// Insider trading (SEC Form 4), parsed straight from EDGAR filings.
//
// Per-ticker: lib/sec fetches the filer's recent Form 4 XML documents and
// parses the non-derivative transactions. Market-wide "latest across all
// companies": EDGAR's current-filings feed lists filers but not parsed
// transactions, so without a ticker this returns a small default set of
// widely-held names instead of a full market stream.
export const revalidate = 1800;

const DEFAULT_TICKERS = ["AAPL", "NVDA", "MSFT", "TSLA", "AMZN", "META"];

function shape(sym: string, rows: any[]) {
  return rows.map((r) => ({
    symbol: sym,
    insider: r.name ?? "Unknown",
    role: r.title ?? "—",
    type: r.type ?? "OTHER",
    shares: r.shares ?? null,
    price: r.price ?? null,
    value: r.value ?? null,
    transactionDate: r.date ?? null,
    filingDate: r.date ?? null,
    url: null,
  }));
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  try {
    if (symbol) {
      const sym = symbol.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
      const rows = await getInsiderTrades(sym);
      return NextResponse.json({ trades: shape(sym, rows) });
    }

    const all = await Promise.all(
      DEFAULT_TICKERS.map(async (sym) => {
        try {
          return shape(sym, await getInsiderTrades(sym));
        } catch {
          return [];
        }
      })
    );
    const trades = all
      .flat()
      .sort((a, b) => (b.transactionDate ?? "").localeCompare(a.transactionDate ?? ""))
      .slice(0, 100);
    return NextResponse.json({
      trades,
      note: "Without a ticker, showing recent Form 4 activity for a default set of widely-held names — a full market-wide stream is not available with current data.",
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch insider trades" }, { status: 500 });
  }
}
