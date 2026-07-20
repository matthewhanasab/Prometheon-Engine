import { NextRequest, NextResponse } from "next/server";
import { getFullStockData, getPriceHistory, getEarnings } from "@/lib/fmp";
import { getFinnhubRecommendations, getFinnhubNews } from "@/lib/finnhub";
import { getInsiderTrades } from "@/lib/sec";
import { get10YTreasury } from "@/lib/fred";

const FMP_BASE = "https://financialmodelingprep.com/stable";

async function getPriceTargetConsensus(ticker: string): Promise<number | null> {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/price-target-consensus?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return row?.targetConsensus ?? row?.targetMedian ?? null;
  } catch { return null; }
}

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

// FMP insider trades (the SEC-EDGAR scraper is fragile and often returns nothing)
async function getInsiderTradesFMP(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/insider-trading/search?symbol=${ticker}&limit=40&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((t: any) => {
      const name = String(t.reportingName ?? "Unknown")
        .split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      const shares = t.securitiesTransacted ?? 0;
      const price = t.price ?? null;
      return {
        date: t.transactionDate ?? t.filingDate ?? "",
        name,
        title: t.typeOfOwner ?? "—",
        type: t.acquisitionOrDisposition === "A" ? "BUY" : t.acquisitionOrDisposition === "D" ? "SELL" : "OTHER",
        shares,
        price,
        value: price && shares ? Math.round(shares * price) : null,
        owned: t.securitiesOwned ?? null,
      };
    });
  } catch { return []; }
}

// Which ETFs hold this stock (Ultimate-plan endpoint). Thousands of rows come
// back and marketValue is denominated in each fund's LOCAL currency (a Chilean
// cross-listing reports pesos), so rank by share count — currency-independent —
// and let the caller price positions in USD.
async function getEtfExposure(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/etf/asset-exposure?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const rows = data.filter((r: any) => r.symbol && (r.sharesNumber ?? 0) > 0);

    // Cross-listings and mutual-fund share classes of the same portfolio report
    // identical positions under different tickers (VTI = VTSAX = VTS.AX …).
    // Collapse rows with matching share count + weight, preferring the cleanest
    // US ETF ticker (no exchange suffix, shortest).
    const byPrint = new Map<string, any>();
    for (const r of rows) {
      // Shares-only fingerprint: identical share counts at this scale always
      // mean the same reported position, even when listed weights differ.
      const print = String(Math.round(r.sharesNumber));
      const cur = byPrint.get(print);
      const cleaner = (a: string, b: string) => {
        const dotA = a.includes(".") || a.includes("-"), dotB = b.includes(".") || b.includes("-");
        if (dotA !== dotB) return dotA ? b : a;
        if (a.length !== b.length) return a.length < b.length ? a : b;
        return a < b ? a : b;
      };
      if (!cur) byPrint.set(print, r);
      else if (cleaner(cur.symbol, r.symbol) === r.symbol) byPrint.set(print, r);
    }
    const distinct = Array.from(byPrint.values());
    const totalShares = distinct.reduce((s: number, r: any) => s + r.sharesNumber, 0);
    const top = distinct
      .sort((a: any, b: any) => b.sharesNumber - a.sharesNumber)
      .slice(0, 12)
      .map((r: any) => ({
        etf: r.symbol,
        weight: r.weightPercentage ?? null,
        shares: r.sharesNumber,
      }));
    return { fundCount: distinct.length, totalShares, top };
  } catch { return null; }
}

// Ownership / float snapshot (institutional-holdings endpoints are gated on our plan)
async function getSharesFloat(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/shares-float?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      freeFloatPct: row.freeFloat ?? null,
      floatShares: row.floatShares ?? null,
      outstandingShares: row.outstandingShares ?? null,
    };
  } catch { return null; }
}

async function getFinancialScores(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/financial-scores?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      piotroskiScore: row.piotroskiScore ?? null,
      altmanZScore: row.altmanZScore ?? null,
    };
  } catch { return null; }
}

async function getDCF(ticker: string): Promise<number | null> {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/discounted-cash-flow?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const row = Array.isArray(data) ? data[0] : data;
    return row?.dcf ?? null;
  } catch { return null; }
}

async function getGrades(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/grades?symbol=${ticker}&limit=8&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 8) : [];
  } catch { return []; }
}

async function getGradesConsensus(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/grades-consensus?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (Array.isArray(data) ? data[0] : data) ?? null;
  } catch { return null; }
}

async function getPeers(ticker: string) {
  const key = process.env.FMP_KEY ?? "";
  try {
    const res = await fetch(
      `${FMP_BASE}/stock-peers?symbol=${ticker}&apikey=${key}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.slice(0, 8) : [];
  } catch { return []; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  try {
    const [stock, price, earnings, recs, news, insidersSec, rf, priceTarget, institutional, scores, dcf, grades, gradesConsensus, peers, insidersFmp, float, etfExposure] = await Promise.all([
      getFullStockData(ticker),
      getPriceHistory(ticker, 365),
      getEarnings(ticker),
      getFinnhubRecommendations(ticker),
      getFinnhubNews(ticker),
      getInsiderTrades(ticker),
      get10YTreasury(),
      getPriceTargetConsensus(ticker),
      getInstitutionalHolders(ticker),
      getFinancialScores(ticker),
      getDCF(ticker),
      getGrades(ticker),
      getGradesConsensus(ticker),
      getPeers(ticker),
      getInsiderTradesFMP(ticker),
      getSharesFloat(ticker),
      getEtfExposure(ticker),
    ]);

    // Prefer FMP insiders (reliable); fall back to the SEC scraper if FMP is empty
    const insiders = insidersFmp.length > 0 ? insidersFmp : insidersSec;

    // Price ETF positions in USD from the live quote (see getEtfExposure note)
    const px = stock.price ?? null;
    const etfExposurePriced = etfExposure && px ? {
      fundCount: etfExposure.fundCount,
      totalValue: etfExposure.totalShares * px,
      top: etfExposure.top.map((r: any) => ({ ...r, marketValue: r.shares * px })),
    } : etfExposure;

    // Compute 1Y return from price history
    let return1Y: number | null = null;
    if (price.length >= 2 && stock.price != null) {
      return1Y = ((stock.price - price[0].price) / price[0].price) * 100;
    }

    // Merge Finnhub price target into stock object
    if (priceTarget && !stock.analystTarget) (stock as any).analystTarget = priceTarget;
    return NextResponse.json({ stock, price, earnings, recs, news, insiders, rf, return1Y, institutional, scores, dcf, grades, gradesConsensus, peers, float, etfExposure: etfExposurePriced });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
