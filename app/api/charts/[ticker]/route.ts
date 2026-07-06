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
    const [income, cashflow, balance, profile, productSegsRaw, geoSegsRaw] = await Promise.all([
      fmpGet("/income-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/cash-flow-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/balance-sheet-statement", { symbol: t, period: "quarterly", limit: "20" }),
      fmpGet("/profile", { symbol: t }),
      fmpGet("/revenue-product-segmentation", { symbol: t }),
      fmpGet("/revenue-geographic-segmentation", { symbol: t }),
    ]);

    return NextResponse.json({
      income:          income          ?? [],
      cashflow:        cashflow        ?? [],
      balance:         balance         ?? [],
      profile:         Array.isArray(profile) ? profile[0] : (profile ?? {}),
      productSegments: Array.isArray(productSegsRaw) ? productSegsRaw : [],
      geoSegments:     Array.isArray(geoSegsRaw)     ? geoSegsRaw     : [],
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch charts data" }, { status: 500 });
  }
}
