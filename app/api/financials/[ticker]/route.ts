import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_KEY!;

async function fmpGet(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();
  const period = req.nextUrl.searchParams.get("period") === "quarterly" ? "quarterly" : "annual";
  const limit = period === "annual" ? "5" : "8";

  try {
    const [income, balance, cashflow] = await Promise.all([
      fmpGet(`/income-statement`, { symbol: t, period, limit }),
      fmpGet(`/balance-sheet-statement`, { symbol: t, period, limit }),
      fmpGet(`/cash-flow-statement`, { symbol: t, period, limit }),
    ]);

    const name = (income as any)?.[0]?.symbol ?? t;

    return NextResponse.json({
      income:   income   ?? [],
      balance:  balance  ?? [],
      cashflow: cashflow ?? [],
      name,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch financials" }, { status: 500 });
  }
}
