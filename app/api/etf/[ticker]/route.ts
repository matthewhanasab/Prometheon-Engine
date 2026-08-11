import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";

// ETF fund data: holdings, allocation, and a live quote.
//
// Holdings come from marketstack's etfholdings endpoint, which is itself a
// wrapper over SEC N-PORT filings (the response carries the fund's CIK and
// 811- file number). Two consequences worth knowing:
//
//  • Coverage gap: SPY and QQQ are unit investment trusts, not 1940-Act
//    open-end funds, so they don't file N-PORT holdings the same way and the
//    endpoint returns nothing for them. VOO/IVV and QQQM are the equivalent
//    1940-Act funds and do work.
//  • Staleness: N-PORT is filed quarterly and published on a delay, so the
//    holdings are as-of a report date that can be a year or more old. The date
//    is returned and shown prominently rather than implied to be current.
const MS = "https://api.marketstack.com/v2";

// SPY/QQQ have no N-PORT holdings — point at the equivalent fund instead.
const UIT_ALTERNATIVES: Record<string, { alt: string; note: string }> = {
  SPY: { alt: "VOO", note: "SPY is a unit investment trust and doesn't file N-PORT holdings." },
  QQQ: { alt: "QQQM", note: "QQQ is a unit investment trust and doesn't file N-PORT holdings." },
  DIA: { alt: "SCHD", note: "DIA is a unit investment trust and doesn't file N-PORT holdings." },
};

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

const numOf = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const ASSET_LABELS: Record<string, string> = {
  EC: "Equity — common",
  EP: "Equity — preferred",
  DBT: "Debt",
  STIV: "Short-term investment",
  RE: "Real estate",
  ABS: "Asset-backed",
  DE: "Derivative",
  COMM: "Commodity",
};

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

  const [holdRaw, eodRaw, infoRaw, divRaw] = await Promise.all([
    get(`${MS}/etfholdings?access_key=${key}&ticker=${t}`),
    get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=2`, 1800),
    get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`),
    get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=8`),
  ]);

  // ── Live quote (works for every ETF, N-PORT or not) ──
  const eod = (Array.isArray(eodRaw?.data) ? eodRaw.data : []).filter((r: any) => numOf(r.close) > 0);
  const price = eod[0] ? numOf(eod[0].close) : null;
  const prev = eod[1] ? numOf(eod[1].close) : null;
  const changePct = price && prev ? ((price - prev) / prev) * 100 : null;

  const info = Array.isArray(infoRaw?.data) ? infoRaw.data[0] : infoRaw?.data;
  const name =
    typeof info?.name === "string" ? info.name.replace(/&amp;/g, "&") : t;

  const divs = (Array.isArray(divRaw?.data) ? divRaw.data : [])
    .map((r: any) => ({ date: String(r.date ?? "").slice(0, 10), amount: numOf(r.dividend) }))
    .filter((d: any) => d.amount > 0);
  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttmDiv = divs.filter((d: any) => d.date >= ttmCutoff).reduce((a: number, d: any) => a + d.amount, 0);

  const quote = {
    price,
    changePct,
    date: eod[0] ? String(eod[0].date).slice(0, 10) : null,
    name,
    ttmDividend: ttmDiv || null,
    yieldPct: ttmDiv > 0 && price ? (ttmDiv / price) * 100 : null,
  };

  // ── Holdings ──
  const out = holdRaw?.output;
  if (!out?.holdings?.length) {
    return NextResponse.json({
      ticker: t,
      quote,
      holdingsAvailable: false,
      reason:
        UIT_ALTERNATIVES[t]?.note ??
        "No N-PORT holdings are published for this ticker — it may not be an ETF, or the fund doesn't file portfolio holdings in this form.",
      suggestion: UIT_ALTERNATIVES[t]?.alt ?? null,
    });
  }

  const attrs = out.attributes ?? {};
  const raw = out.holdings.map((h: any) => h.investment_security ?? h);
  const total = raw.reduce((a: number, h: any) => a + numOf(h.value_usd), 0);

  const holdings = raw
    .map((h: any) => ({
      name: String(h.name ?? h.title ?? "—").trim(),
      cusip: h.cusip ?? null,
      isin: h.isin ?? null,
      valueUsd: numOf(h.value_usd),
      // percent_value is ALREADY a percentage of net assets, not a fraction:
      // Apple comes through as 7.59 meaning 7.59% of VOO. Scaling it by 100
      // put the largest holding at 759% of the fund.
      weightPct: numOf(h.percent_value),
      country: h.invested_country ?? null,
      assetCategory: h.asset_category ?? null,
      payoff: h.payoff_profile ?? null,
    }))
    .filter((h: any) => h.valueUsd > 0)
    .sort((a: any, b: any) => b.valueUsd - a.valueUsd);

  const bucket = (keyOf: (h: any) => string | null, labels?: Record<string, string>) => {
    const m = new Map<string, number>();
    for (const h of holdings) {
      const k = keyOf(h) || "Other";
      m.set(k, (m.get(k) ?? 0) + h.valueUsd);
    }
    return [...m.entries()]
      .map(([k, v]) => ({ key: labels?.[k] ?? k, valueUsd: v, weightPct: total > 0 ? (v / total) * 100 : 0 }))
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, 12);
  };

  return NextResponse.json({
    ticker: t,
    quote,
    holdingsAvailable: true,
    fund: {
      name: holdRaw?.basics?.fund_name ?? name,
      seriesName: attrs.series_name ?? null,
      cik: holdRaw?.basics?.cik ?? null,
      fileNumber: holdRaw?.basics?.file_number ?? null,
      isin: attrs.isin ?? null,
      reportDate: attrs.date_report_period ?? null,
    },
    totals: { netAssets: total, count: holdings.length },
    top: holdings.slice(0, 25),
    countries: bucket((h) => h.country),
    categories: bucket((h) => h.assetCategory, ASSET_LABELS),
  });
}
