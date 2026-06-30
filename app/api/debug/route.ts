import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("t") ?? "AAPL";
  const KEY = process.env.FMP_KEY!;
  const url = `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${ticker}&apikey=${KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();
  return NextResponse.json(data?.[0] ?? {});
}
