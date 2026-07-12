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
    const [stock, price, earnings, recs, news, insiders, rf, priceTarget, institutional, scores, dcf, grades, gradesConsensus, peers] = await Promise.all([
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
    ]);

    // Compute 1Y return from price history
    let return1Y: number | null = null;
    if (price.length >= 2 && stock.price != null) {
      return1Y = ((stock.price - price[0].price) / price[0].price) * 100;
    }

    // Merge Finnhub price target into stock object
    if (priceTarget && !stock.analystTarget) (stock as any).analystTarget = priceTarget;
    return NextResponse.json({ stock, price, earnings, recs, news, insiders, rf, return1Y, institutional, scores, dcf, grades, gradesConsensus, peers });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
