import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { fetchFacts, resolveCik, Facts, C } from "@/lib/edgarFacts";

// Options inputs for the Market Stack edition.
//
// The options pages never consumed an options chain — strikes, premiums, greeks
// and probabilities are all computed client-side from Black-Scholes. The feed
// only has to supply price, a volatility estimate, the risk-free rate and the
// next earnings date. All four come from the current stack:
//   price / 52-week range / history → marketstack
//   risk-free rate (3-month T-bill) → FRED
//   next earnings date              → projected from SEC filing cadence
//
// Response shape matches /api/covered-calls exactly so both pages reuse it.
const MS = "https://api.marketstack.com/v2";

async function get(url: string, ttl = 1800): Promise<any> {
  try {
    let res = await fetch(url, { next: { revalidate: ttl } });
    let json = await res.json().catch(() => null);
    if (json?.error?.code === "rate_limit_reached") {
      await new Promise((r) => setTimeout(r, 1400));
      res = await fetch(url, { next: { revalidate: ttl } });
      json = await res.json().catch(() => null);
    }
    return json;
  } catch {
    return null;
  }
}

async function getFred3M(): Promise<number | null> {
  const key = process.env.FRED_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DGS3MO&api_key=${key}&file_type=json&sort_order=desc&limit=5`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data.observations ?? []).find((o: any) => o.value !== ".");
    return obs ? parseFloat(obs.value) / 100 : null;
  } catch {
    return null;
  }
}

/**
 * Project the next earnings date from SEC filing history.
 *
 * There is no forward earnings calendar outside licensed providers, but the
 * cadence is highly regular: take the median lag between each fiscal period end
 * and the 10-Q/10-K that reported it, then apply it to the next period end.
 * Returned as an estimate and labelled as such in the response.
 */
function projectEarnings(facts: Facts): { date: string | null; estimated: boolean } {
  const periods = facts.quarterlyComplete(C.revenue);
  if (periods.length < 4) return { date: null, estimated: false };
  const ends = periods.map((p) => Date.parse(p.end)).sort((a, b) => a - b);

  // Median spacing between period ends (~91 days for a normal quarterly filer).
  const gaps: number[] = [];
  for (let i = 1; i < ends.length; i++) gaps.push(ends[i] - ends[i - 1]);
  gaps.sort((a, b) => a - b);
  const medGap = gaps[Math.floor(gaps.length / 2)];
  if (!(medGap > 60 * 864e5 && medGap < 120 * 864e5)) return { date: null, estimated: false };

  // Typical reporting lag: companies file 3–6 weeks after a quarter closes.
  const REPORT_LAG = 32 * 864e5;
  let next = ends[ends.length - 1] + medGap + REPORT_LAG;
  const now = Date.now();
  // Roll forward if the projection has already passed.
  while (next < now) next += medGap;
  return { date: new Date(next).toISOString().slice(0, 10), estimated: true };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 4);
  if (limited) return limited;
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  const [eodRaw, intraRaw, infoRaw, rfr, cik] = await Promise.all([
    get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=400`),
    // Option strikes are picked relative to spot, so prefer the live IEX print
    // over the previous close when the market is open.
    get(`${MS}/intraday?access_key=${key}&symbols=${t}&interval=1min&limit=1`, 120),
    get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`, 86400),
    getFred3M(),
    resolveCik(t),
  ]);

  const rows = (Array.isArray(eodRaw?.data) ? eodRaw.data : [])
    .map((r: any) => ({
      date: String(r.date ?? "").slice(0, 10),
      price: Number(r.adj_close ?? r.close ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
    }))
    .filter((r: any) => r.date && r.price > 0)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  if (rows.length < 30) {
    return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
  }

  // Use the live IEX print only when it is genuinely fresher than the last
  // close. Off-hours the intraday feed can return a stale snapshot — NVDA came
  // back at 200.72 against a 219.22 close, and a stale spot would misplace
  // every strike on the page. Only trust it if its bar is at least as recent
  // as the newest EOD row.
  const lastEod = rows[rows.length - 1];
  const intraRow = Array.isArray(intraRaw?.data) ? intraRaw.data[0] : null;
  const intraDate = intraRow?.date ? String(intraRow.date).slice(0, 10) : null;
  const intraLast =
    intraRow && intraDate && intraDate >= lastEod.date
      ? [intraRow.marketstack_last, intraRow.last, intraRow.mid]
          .map((v: any) => Number(v))
          .find((v: number) => Number.isFinite(v) && v > 0) ?? null
      : null;
  const price = intraLast ?? lastEod.price;
  const yearWindow = rows.slice(-252);
  const week52High = Math.max(...yearWindow.map((r: any) => r.high || r.price));
  const week52Low = Math.min(...yearWindow.map((r: any) => r.low || r.price));

  // ── 21-day annualized historical volatility (the IV proxy) ──
  //
  // Gap-aware: marketstack emits a few rows a year with close = 0, which get
  // filtered above. Computing a return straight across the hole spans two or
  // more sessions and lands a ~√2 outsized move in the series — NVIDIA had
  // three such rows in one recent month and its 21-day vol came out 14% hot.
  // Inflated vol inflates every modelled premium on the page, so returns that
  // bridge a gap are dropped instead.
  const rets: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const spanDays = (Date.parse(rows[i].date) - Date.parse(rows[i - 1].date)) / 864e5;
    if (spanDays > 4) continue; // more than a weekend ⇒ a session is missing
    rets.push(Math.log(rows[i].price / rows[i - 1].price));
  }

  const stdevAnnual = (win: number[]): number => {
    const m = win.reduce((a, b) => a + b, 0) / win.length;
    const v = win.reduce((a, b) => a + (b - m) ** 2, 0) / (win.length - 1);
    return Math.sqrt(v) * Math.sqrt(252);
  };
  const hv21 = rets.length >= 21 ? stdevAnnual(rets.slice(-21)) : null;

  // ── HV rank: where today's vol sits in its own 1-year range ──
  let hvRank: number | null = null;
  if (rets.length > 60 && hv21 != null) {
    const rolling: number[] = [];
    for (let i = 21; i <= rets.length; i++) rolling.push(stdevAnnual(rets.slice(i - 21, i)));
    const lo = Math.min(...rolling), hi = Math.max(...rolling);
    hvRank = hi > lo ? Math.max(0, Math.min(100, ((hv21 - lo) / (hi - lo)) * 100)) : 50;
  }

  // ── Next earnings, projected from filing cadence ──
  let nextEarnings: string | null = null;
  let earningsEstimated = false;
  if (cik) {
    const facts = await fetchFacts(cik);
    if (facts) {
      try {
        const p = projectEarnings(facts);
        nextEarnings = p.date;
        earningsEstimated = p.estimated;
      } catch { /* leave unset — the page treats null as "unknown" */ }
    }
  }

  const info = Array.isArray(infoRaw?.data) ? infoRaw.data[0] : infoRaw?.data;
  const name = typeof info?.name === "string" ? info.name.replace(/&amp;/g, "&") : t;

  return NextResponse.json({
    ticker: t,
    name,
    price,
    week52High,
    week52Low,
    hv21,
    hvRank,
    rfr: rfr ?? 0.045,
    nextEarnings,
    earningsEstimated,
  });
}
