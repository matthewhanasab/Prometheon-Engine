import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";

// Daily closes of an underlying, for valuing one of its option contracts back
// through time.
//
// No public feed carries the price history of an individual contract: the
// exchange's quote file is a snapshot of today, and its per-contract history
// endpoints are closed. What the exchange does publish is the daily history of
// the underlying itself, unadjusted for dividends, which is what a contract's
// value is computed from. The options page takes these closes and today's
// quote for the contract and estimates what it was worth on each day.
//
// A year and a half is returned: enough for the longest window the page offers
// (one year) with room for the trading days around it.
const CBOE = "https://cdn.cboe.com/api/global/delayed_quotes/charts/historical";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 8);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });

  let rows: { date?: unknown; close?: unknown }[] = [];
  try {
    const res = await fetch(`${CBOE}/${t}.json`, {
      headers: { "User-Agent": "Prometheon Engine (matthanasab@gmail.com)" },
      next: { revalidate: 3600 },
    });
    if (res.status === 404 || res.status === 403) {
      return NextResponse.json({ error: `No price history for ${t}` }, { status: 404 });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    rows = Array.isArray(json?.data) ? json.data : [];
  } catch (e) {
    return NextResponse.json(
      { error: `Price history unavailable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  // The exchange's closes are already adjusted for splits, but the file carries
  // the odd stray print left on the old basis (Carvana shows $304 on a market
  // holiday between two days near $61, five times its price, which is its 5-for-1
  // split). A close that sits far from BOTH neighbours, while they agree with
  // each other, is not a price; it is dropped.
  const dated = rows
    .map((r) => ({ date: String(r.date ?? "").slice(0, 10), close: Number(r.close) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.close) && r.close > 0)
    .slice(-382);
  const closes = dated.filter((r, i) => {
    const a = dated[i - 1]?.close, b = dated[i + 1]?.close;
    if (!a || !b) return true;
    const neighboursAgree = Math.abs(Math.log(a / b)) < 0.25;
    const far = Math.abs(Math.log(r.close / a)) > 0.7 && Math.abs(Math.log(r.close / b)) > 0.7;
    return !(neighboursAgree && far);
  }).slice(-380);
  if (closes.length < 5) return NextResponse.json({ error: `No price history for ${t}` }, { status: 404 });

  return NextResponse.json({ ticker: t, closes }, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
