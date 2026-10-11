import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { msGet } from "@/lib/marketstack";

// Latest traded price for a ticker.
//
// The research payload is cached for an hour and its headline price is the
// last daily close, so during the session the big number was yesterday's.
// This is the one thing on the page that should move: the Business plan
// carries a real-time price feed, so this route serves it with a one-minute
// edge cache, and the page swaps it in over the close when it is newer.
const MS = "https://api.marketstack.com/v2";

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 1);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });
  if (!key) return NextResponse.json({ ticker: t, price: null, time: null, source: null });

  let price: number | null = null;
  let time: string | null = null;
  let source: string | null = null;

  // The page passes the listing exchange and the last close it already has.
  // Without the exchange filter the feed answered AAPL with a foreign
  // listing's print (21,770, five months old), so an unfiltered row is only
  // trusted when it sits near the known close.
  const exchange = (req.nextUrl.searchParams.get("exchange") ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  const ref = Number(req.nextUrl.searchParams.get("ref"));
  const plausible = (p: number) => !(ref > 0) || (p > ref * 0.6 && p < ref * 1.4);
  // "2026-05-08 17:00:00" carries no zone; the feed's clocks are UTC.
  const utc = (v: unknown) => {
    const str = String(v ?? "").trim();
    if (!str) return null;
    return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str) ? str.replace(" ", "T") + "Z" : str;
  };

  // Primary: the real-time price endpoint. Its payload is a single object or
  // a one-element array depending on the exchange filter, so take either.
  const live = await msGet(
    `${MS}/stockprice?access_key=${key}&ticker=${t}${exchange ? `&exchange=${exchange}` : ""}`, 30
  );
  const rowsLive = Array.isArray(live.data?.data) ? live.data.data : live.data?.data ? [live.data.data] : [];
  const row = rowsLive.find((r: Record<string, unknown>) => {
    const p = num(r?.price);
    return p != null && plausible(p) && (!exchange || String(r?.exchange_code ?? "").toUpperCase() === exchange);
  }) ?? rowsLive.find((r: Record<string, unknown>) => num(r?.price) != null && plausible(num(r?.price)!));
  if (row) {
    price = num(row.price);
    time = utc(row.trade_last);
    source = "realtime";
  }

  // Fallback: the latest intraday bar.
  if (price == null) {
    const bar = await msGet(`${MS}/intraday/latest?access_key=${key}&symbols=${t}`, 60);
    const b = Array.isArray(bar.data?.data) ? bar.data.data[0] : null;
    if (b) {
      const p = num(b.last) ?? num(b.marketstack_last) ?? num(b.close);
      if (p != null && plausible(p)) {
        price = p;
        time = utc(b.date);
        source = "intraday";
      }
    }
  }

  return NextResponse.json(
    { ticker: t, price, time, source },
    {
      headers: {
        "Cache-Control": price != null
          ? "public, max-age=0, s-maxage=60, stale-while-revalidate=120"
          : "public, max-age=0, s-maxage=30",
      },
    }
  );
}
