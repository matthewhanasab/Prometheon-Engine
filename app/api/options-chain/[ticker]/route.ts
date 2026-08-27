import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";

// Real options chain — quotes and greeks as published by the exchange.
//
// The covered-call and cash-secured-put pages derive their premiums and greeks
// from Black-Scholes on a volatility estimate, because no chain was available
// in the stack. Those are theoretical values: correct as model output, but not
// what anything actually trades at. This route serves the real book instead.
//
// Cboe publishes a delayed quote file per underlying containing every listed
// contract: bid/ask with sizes, last trade, open interest, volume, implied
// volatility and all five greeks, already computed by the exchange. Nothing is
// modelled here — delta and theta come down the wire.
//
// Two things the source dictates:
//
//   - It is a SNAPSHOT, not a series. Each contract carries today's open/high/
//     low/last and the previous close, and no history at all. A per-contract
//     price chart therefore can't be drawn from one response; it needs daily
//     snapshots accumulated over time.
//   - Quotes are 15 minutes delayed, and after the close the file holds the
//     final print of the session. `asOf` reports the newest trade timestamp in
//     the file so the UI can state its own staleness rather than implying live
//     data.
//
// The upstream file is ~1.5MB for a mega-cap (3,000+ contracts). It is parsed
// and reduced here so the browser is never handed the raw payload.
const CBOE = "https://cdn.cboe.com/api/global/delayed_quotes/options";

export type Contract = {
  symbol: string;
  strike: number;
  expiry: string;
  side: "call" | "put";
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  theo: number | null;
  prevClose: number | null;
  lastTradeTime: string | null;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// OCC symbols are root + YYMMDD + C|P + strike×1000 in 8 digits. Roots vary in
// length and can contain digits, so this reads from the right, where every
// field is fixed-width, rather than trying to match the root.
export function parseOcc(sym: string): { expiry: string; side: "call" | "put"; strike: number } | null {
  const m = /^(.+?)(\d{6})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  const [, , ymd, cp, strike8] = m;
  const yy = Number(ymd.slice(0, 2));
  const expiry = `20${String(yy).padStart(2, "0")}-${ymd.slice(2, 4)}-${ymd.slice(4, 6)}`;
  if (Number.isNaN(Date.parse(expiry))) return null;
  return { expiry, side: cp === "C" ? "call" : "put", strike: Number(strike8) / 1000 };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 8);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });

  const p = req.nextUrl.searchParams;
  const wantExpiry = p.get("expiry");

  let payload: { data?: Record<string, unknown> } | null = null;
  try {
    const res = await fetch(`${CBOE}/${t}.json`, {
      headers: { "User-Agent": "Prometheon Engine (matthanasab@gmail.com)" },
      next: { revalidate: 900 },
    });
    // Cboe answers 404 for anything with no listed options, which is a real
    // answer about the symbol rather than a failure to report.
    if (res.status === 404) {
      return NextResponse.json({ error: `No listed options for ${t}` }, { status: 404 });
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    payload = await res.json();
  } catch (e) {
    return NextResponse.json(
      { error: `Options feed unavailable: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }

  const data: Record<string, unknown> = payload?.data ?? {};
  const raw: Record<string, unknown>[] = Array.isArray(data.options) ? data.options : [];
  if (!raw.length) return NextResponse.json({ error: `No contracts for ${t}` }, { status: 404 });

  const spot = num(data.close) ?? num(data.last) ?? null;

  const all: Contract[] = [];
  for (const o of raw) {
    const parsed = parseOcc(String(o.option ?? ""));
    if (!parsed) continue;
    const bid = num(o.bid);
    const ask = num(o.ask);
    all.push({
      symbol: String(o.option),
      strike: parsed.strike,
      expiry: parsed.expiry,
      side: parsed.side,
      bid, ask,
      mid: bid != null && ask != null && ask > 0 ? (bid + ask) / 2 : null,
      last: num(o.last_trade_price),
      change: num(o.change),
      changePct: num(o.percent_change),
      volume: num(o.volume),
      openInterest: num(o.open_interest),
      iv: num(o.iv),
      delta: num(o.delta),
      gamma: num(o.gamma),
      theta: num(o.theta),
      vega: num(o.vega),
      rho: num(o.rho),
      theo: num(o.theo),
      prevClose: num(o.prev_day_close),
      lastTradeTime: o.last_trade_time ? String(o.last_trade_time) : null,
    });
  }

  const expiries = [...new Set(all.map((c) => c.expiry))].sort();
  // Staleness is stated from the data itself rather than assumed from the clock.
  const stamps = all.map((c) => c.lastTradeTime).filter(Boolean) as string[];
  const asOf = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : null;

  const expiry = wantExpiry && expiries.includes(wantExpiry) ? wantExpiry : expiries[0] ?? null;
  const slice = expiry ? all.filter((c) => c.expiry === expiry) : [];
  const byStrike = (a: Contract, b: Contract) => a.strike - b.strike;

  return NextResponse.json(
    {
      ticker: t,
      spot,
      asOf,
      delayed: true,
      expiry,
      expiries,
      totalContracts: all.length,
      calls: slice.filter((c) => c.side === "call").sort(byStrike),
      puts: slice.filter((c) => c.side === "put").sort(byStrike),
    },
    {
      // Matches the upstream revalidate: a delayed feed gains nothing from being
      // re-fetched more often than it updates.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600" },
    }
  );
}
