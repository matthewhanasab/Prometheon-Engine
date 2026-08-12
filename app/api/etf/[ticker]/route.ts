import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { expenseRatioFor } from "@/lib/etfExpenseRatios";

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

  const anchorFor = (y: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - y);
    return d.toISOString().slice(0, 10);
  };

  const [holdRaw, eodRaw, infoRaw, divRaw, anchor10Raw] = await Promise.all([
    get(`${MS}/etfholdings?access_key=${key}&ticker=${t}`),
    // Five years of daily closes: powers the chart AND the 1/3/5-year returns,
    // and its newest two rows give the live quote + prior close.
    get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(5)}&limit=1400`, 1800),
    get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`),
    get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=20`),
    get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(10)}&sort=ASC&limit=1`),
  ]);

  // ── Price series (ascending) — chart + returns + 52-week stats ──
  const series = (Array.isArray(eodRaw?.data) ? eodRaw.data : [])
    .map((r: any) => ({
      date: String(r.date ?? "").slice(0, 10),
      close: numOf(r.close),
      adj: numOf(r.adj_close ?? r.close),
      high: numOf(r.high),
      low: numOf(r.low),
    }))
    .filter((r: any) => r.date && r.close > 0)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  const last = series[series.length - 1] ?? null;
  const prevBar = series[series.length - 2] ?? null;
  const price = last ? last.close : null;
  const changePct = price && prevBar ? ((price - prevBar.close) / prevBar.close) * 100 : null;

  const yearBars = series.slice(-252);
  const week52High = yearBars.length ? Math.max(...yearBars.map((r: any) => r.high || r.close)) : null;
  const week52Low = yearBars.length ? Math.min(...yearBars.map((r: any) => r.low || r.close)) : null;
  const pos52 =
    week52High != null && week52Low != null && week52High > week52Low && price != null
      ? ((price - week52Low) / (week52High - week52Low)) * 100
      : null;

  // Full daily series (adjusted, so a split doesn't draw a cliff). Kept at full
  // resolution rather than thinned because the page's range toggle slices this
  // client-side — a thinned 5-year series leaves a 1M window with ~7 points.
  const chart = series.map((r: any) => ({ date: r.date, price: r.adj }));

  // Long-horizon total returns on adjusted closes.
  const anchorFromSeries = (fromDate: string) => series.find((r: any) => r.date >= fromDate) ?? null;
  const lastAdj = last ? last.adj : null;
  const retOf = (row: { adj: number } | null, years: number) => {
    if (!row || !(row.adj > 0) || lastAdj == null) return null;
    return { years, totalPct: ((lastAdj - row.adj) / row.adj) * 100, cagrPct: (Math.pow(lastAdj / row.adj, 1 / years) - 1) * 100 };
  };
  const anchor10 = (Array.isArray(anchor10Raw?.data) ? anchor10Raw.data : [])[0];
  const returns = [
    retOf(anchorFromSeries(anchorFor(1)), 1),
    retOf(anchorFromSeries(anchorFor(3)), 3),
    retOf(anchorFromSeries(anchorFor(5)), 5),
    anchor10 && numOf(anchor10.adj_close ?? anchor10.close) > 0
      ? retOf({ adj: numOf(anchor10.adj_close ?? anchor10.close) }, 10)
      : null,
  ].filter(Boolean);

  const info = Array.isArray(infoRaw?.data) ? infoRaw.data[0] : infoRaw?.data;
  const name = typeof info?.name === "string" ? info.name.replace(/&amp;/g, "&") : t;

  const divs = (Array.isArray(divRaw?.data) ? divRaw.data : [])
    .map((r: any) => ({ date: String(r.date ?? "").slice(0, 10), amount: numOf(r.dividend) }))
    .filter((d: any) => d.amount > 0);
  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttmDiv = divs.filter((d: any) => d.date >= ttmCutoff).reduce((a: number, d: any) => a + d.amount, 0);
  const payFreq = divs.filter((d: any) => d.date >= ttmCutoff).length;

  const expenseRatio = expenseRatioFor(t);
  const quote = {
    price,
    changePct,
    date: last ? last.date : null,
    name,
    week52High,
    week52Low,
    pos52,
    ttmDividend: ttmDiv || null,
    yieldPct: ttmDiv > 0 && price ? (ttmDiv / price) * 100 : null,
    payoutsPerYear: payFreq || null,
    expenseRatio,
    // Net yield after the fund's fee — what the dividend actually delivers.
    netYieldPct: ttmDiv > 0 && price && expenseRatio != null ? (ttmDiv / price) * 100 - expenseRatio : null,
    returns,
    chart,
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
      fairLevel: h.fair_value_level ?? null,
      onLoan: h.loan_by_fund === "Y",
    }))
    .filter((h: any) => h.valueUsd > 0)
    .sort((a: any, b: any) => b.valueUsd - a.valueUsd);

  // ── Concentration ──
  // Herfindahl over holding weights → effective number of holdings (1/HHI):
  // how many equally-weighted names the fund "behaves like". VOO has 500
  // holdings but an effective count near 120 because the megacaps dominate.
  const hhi = holdings.reduce((a: number, h: any) => a + (h.weightPct / 100) ** 2, 0);
  const effectiveHoldings = hhi > 0 ? 1 / hhi : null;
  const top10 = holdings.slice(0, 10).reduce((a: number, h: any) => a + h.weightPct, 0);

  // ── Novel N-PORT cuts ──
  // Securities lent out for income — a small extra-return source, and a
  // counterparty-risk signal when large.
  const onLoanValue = holdings.filter((h: any) => h.onLoan).reduce((a: number, h: any) => a + h.valueUsd, 0);
  // Fair-value hierarchy: Level 1 = quoted market prices (most liquid),
  // Level 3 = unobservable/estimated (least). A fund heavy in Level 3 is a
  // liquidity flag.
  const shortValue = holdings
    .filter((h: any) => String(h.payoff).toLowerCase() === "short")
    .reduce((a: number, h: any) => a + Math.abs(h.valueUsd), 0);

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
    totals: {
      netAssets: total,
      count: holdings.length,
      top10Weight: top10,
      effectiveHoldings,
      largestWeight: holdings[0]?.weightPct ?? null,
      largestName: holdings[0]?.name ?? null,
      onLoanPct: total > 0 ? (onLoanValue / total) * 100 : 0,
      shortPct: total > 0 ? (shortValue / total) * 100 : 0,
    },
    top: holdings.slice(0, 25),
    // Every position, for the page's "see all" toggle. Opt-in because a broad
    // fund can carry thousands of rows and the default view shows 25.
    all: req.nextUrl.searchParams.get("all") ? holdings : undefined,
    // Full lightweight list only when asked (the Compare page needs every
    // holding to compute overlap; the Hub doesn't).
    full: req.nextUrl.searchParams.get("full")
      ? holdings.map((h: any) => ({ id: h.cusip || h.isin || h.name, name: h.name, weightPct: h.weightPct }))
      : undefined,
    countries: bucket((h) => h.country),
    categories: bucket((h) => h.assetCategory, ASSET_LABELS),
    fairValue: bucket((h) => (h.fairLevel ? `Level ${h.fairLevel}` : "Unclassified")),
  });
}
