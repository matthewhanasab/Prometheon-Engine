import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";

export async function GET(req: NextRequest) {
  const key = process.env.FMP_KEY ?? "";
  const { searchParams } = req.nextUrl;

  const params = new URLSearchParams();
  params.set("apikey", key);
  params.set("country", searchParams.get("country") ?? "US");
  params.set("limit", searchParams.get("limit") ?? "50");

  const sector = searchParams.get("sector");
  const minMarketCap = searchParams.get("minMarketCap");
  const maxMarketCap = searchParams.get("maxMarketCap");
  const minPE = searchParams.get("minPE");
  const maxPE = searchParams.get("maxPE");
  const minRevenueGrowth = searchParams.get("minRevenueGrowth");

  if (sector) params.set("sector", sector);
  if (minMarketCap) params.set("marketCapMoreThan", minMarketCap);
  if (maxMarketCap) params.set("marketCapLowerThan", maxMarketCap);
  if (minPE) params.set("peRatioMoreThan", minPE);
  if (maxPE) params.set("peRatioLowerThan", maxPE);
  if (minRevenueGrowth) params.set("revenueGrowthMoreThan", minRevenueGrowth);

  try {
    const res = await fetch(`${BASE}/stock-screener?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = await res.json();
    return NextResponse.json({ results: Array.isArray(data) ? data : [] });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
