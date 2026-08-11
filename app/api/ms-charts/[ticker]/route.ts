import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { fetchFacts, deriveChartSeries, resolveCik } from "@/lib/edgarFacts";

// Charts data for the Market Stack edition.
//
// Quarterly fundamentals come from SEC EDGAR XBRL (marketstack's Statements
// endpoints 404 despite being on the Business plan). Prices come from
// marketstack, and power the historical P/E and P/S charts by pairing each
// quarter-end close against that quarter's trailing-twelve-month EPS/revenue.
const MS = "https://api.marketstack.com/v2";

async function get(url: string, ttl = 86400): Promise<any> {
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 3);
  if (limited) return limited;
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  const cik = await resolveCik(t);
  if (!cik) return NextResponse.json({ error: `No SEC filer found for ${t}` }, { status: 404 });

  const [facts, infoRaw, eodRaw] = await Promise.all([
    fetchFacts(cik),
    get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`),
    // ~8 years of daily closes: enough to place a price against every quarter
    // end in the 28-quarter window the charts render.
    get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=2200`),
  ]);
  if (!facts) return NextResponse.json({ error: `No XBRL filings for ${t}` }, { status: 404 });

  let series: any;
  try {
    series = deriveChartSeries(facts);
  } catch (e: any) {
    return NextResponse.json({ error: `Could not derive series: ${e?.message ?? e}` }, { status: 500 });
  }

  const info = Array.isArray(infoRaw?.data) ? infoRaw.data[0] : infoRaw?.data;
  const decode = (s: any) =>
    typeof s === "string" ? s.replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"') : s;

  // ── Price at each quarter end, for the valuation-multiple charts ──
  const prices = (Array.isArray(eodRaw?.data) ? eodRaw.data : [])
    .map((r: any) => ({ date: String(r.date ?? "").slice(0, 10), price: Number(r.adj_close ?? r.close ?? 0) }))
    .filter((p: any) => p.date && p.price > 0)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const priceAt = (date: string): number | null => {
    // Last close on or before the period end; quarter ends often fall on a
    // weekend or holiday, so an exact-date lookup would miss.
    let lo = 0, hi = prices.length - 1, best: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (prices[mid].date <= date) { best = prices[mid].price; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  };

  const peSeries = (series.epsTtm as any[])
    .map((p) => {
      const price = priceAt(p.date);
      return price && p.value > 0 ? { date: p.date, label: p.label, value: price / p.value } : null;
    })
    .filter(Boolean);

  const sharesByDate = new Map((series.sharesForRatio as any[]).map((p) => [p.date, p.value]));
  const psSeries = (series.revenueTtm as any[])
    .map((p) => {
      const price = priceAt(p.date);
      const sh = sharesByDate.get(p.date);
      return price && sh && p.value > 0 ? { date: p.date, label: p.label, value: (price * sh) / p.value } : null;
    })
    .filter(Boolean);

  return NextResponse.json({
    ticker: t,
    profile: {
      companyName: decode(info?.name) ?? t,
      sector: decode(info?.sector) ?? null,
      industry: decode(info?.industry) ?? null,
      exchange: info?.exchange_code ?? null,
    },
    series: { ...series, pe: peSeries, ps: psSeries },
  });
}
