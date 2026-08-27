"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import CompareChart from "@/components/CompareChart";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";
import CompanyLogo from "@/components/CompanyLogo";


// Compare Stocks — Market Stack edition. Mirrors /compare exactly: the same
// five ticker slots, overview cards, performance race, category scorecard and
// starred metric table. Metrics that need analyst estimates carry an explicit
// "Not available with current data" marker instead of being silently dropped.
// Literal, not themed: --accent-gold resolves to a blue (#3b6eeb light /
// #6B9CFF dark) despite the name, so using it here made ticker 2's line
// indistinguishable from ticker 1's on the performance race.
const COLORS = ["#3B82F6", "#F59E0B", "#22C55E", "#A78BFA", "#EF4444"];
const MAX_TICKERS = 5;
// Shown when no ?t= is given, so /compare opens on a worked example.
const DEFAULT_TICKERS = "AAPL,MSFT,GOOGL";
const SANS = "'Public Sans', sans-serif";
const MONO = "'Spline Sans Mono', monospace";
const SERIF = "'Space Grotesk', Georgia, serif";

const NA = Symbol("not-available-on-marketstack");

function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(d);
}
const fmtX = (n: number | null | undefined) => (n == null || isNaN(n) ? "N/A" : `${n.toFixed(2)}×`);
const fmtPct = (n: number | null | undefined, alreadyPct = false) =>
  n == null || isNaN(n) ? "N/A" : `${(alreadyPct ? n : n * 100).toFixed(2)}%`;
function fmtLarge(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

type MetricDef = {
  label: string;
  key: ((s: any) => number | null) | null; // null ⇒ not available with current data
  fmt: (v: number | null) => string;
  lowerIsBetter?: boolean;
  /** Typical range shown on the right, e.g. "20–28". */
  bench?: string;
  /** Colour band for the label pill. */
  accent?: string;
  /** Value comes from our trend projection, not analyst consensus. */
  modeled?: boolean;
};

const ACCENTS = {
  valuation: "var(--accent-gold)",
  eps: "#F59E0B",
  revenue: "#3B82F6",
  margins: "#22C55E",
  other: "#A78BFA",
};

// Metric bands, matching the reference comparison layout: valuation multiples,
// EPS growth, revenue growth, margins, then advanced cuts. Benchmarks are the
// "many stocks trade at …" ranges, so a figure can be judged without knowing
// the norms by heart. Rows needing analyst estimates carry key: null.
const SECTIONS: { title: string; groups: { accent: string; metrics: MetricDef[] }[] }[] = [
  {
    title: "MANDATORY METRICS",
    groups: [
      {
        accent: ACCENTS.valuation,
        metrics: [
          { label: "TTM P/E", key: (s) => s.peRatio, fmt: fmtX, lowerIsBetter: true, bench: "20–28" },
          { label: "Forward P/E", key: (s) => s.forwardPe, fmt: fmtX, lowerIsBetter: true, bench: "18–26", modeled: true },
          { label: "2-Year Forward P/E", key: (s) => s.forwardPe2y, fmt: fmtX, lowerIsBetter: true, bench: "16–24", modeled: true },
        ],
      },
      {
        accent: ACCENTS.eps,
        metrics: [
          { label: "TTM EPS Growth", key: (s) => s.epsGrowthTtm, fmt: fmtPct, bench: "8–12%" },
          { label: "Current Yr Exp EPS Growth", key: null, fmt: () => "", bench: "8–12%" },
          { label: "Next Year EPS Growth", key: null, fmt: () => "", bench: "8–12%" },
        ],
      },
      {
        accent: ACCENTS.revenue,
        metrics: [
          { label: "TTM Revenue Growth", key: (s) => s.revenueGrowth, fmt: fmtPct, bench: "4.5–6.5%" },
          { label: "Current Yr Exp Rev Growth", key: null, fmt: () => "", bench: "4.5–6.5%" },
          { label: "Next Year Revenue Growth", key: null, fmt: () => "", bench: "4.5–6.5%" },
        ],
      },
      {
        accent: ACCENTS.margins,
        metrics: [
          { label: "Gross Margin", key: (s) => s.grossMargin, fmt: fmtPct, bench: "40–48%" },
          { label: "Net Margin", key: (s) => s.netMargin, fmt: fmtPct, bench: "8–10%" },
          { label: "TTM P/S Ratio", key: (s) => s.ps, fmt: fmtX, lowerIsBetter: true, bench: "1.8–2.6" },
          { label: "Forward P/S Ratio", key: null, fmt: () => "", bench: "1.8–2.6" },
        ],
      },
    ],
  },
  {
    title: "ADVANCED METRICS",
    groups: [
      {
        accent: ACCENTS.eps,
        metrics: [
          { label: "Last Year EPS Growth", key: (s) => s.lastYearEpsGrowth, fmt: fmtPct, bench: "8–12%" },
          { label: "TTM vs NTM EPS Growth", key: (s) => s.forwardEpsGrowth, fmt: fmtPct, bench: "8–12%", modeled: true },
          { label: "Current Qtr EPS Growth vs Prev Year", key: (s) => s.currentQuarterEpsGrowth, fmt: fmtPct, bench: "8–12%" },
          { label: "2-Year Stack Exp EPS Growth", key: (s) => s.forwardEpsGrowth2y, fmt: fmtPct, bench: "16–25%", modeled: true },
        ],
      },
      {
        accent: ACCENTS.revenue,
        metrics: [
          { label: "Last Year Rev Growth", key: (s) => s.lastYearRevGrowth, fmt: fmtPct, bench: "4.5–6.5%" },
          { label: "TTM vs NTM Rev Growth", key: null, fmt: () => "", bench: "4.5–6.5%" },
          { label: "Current Qtr Rev Growth vs Prev Year", key: (s) => s.currentQuarterRevGrowth, fmt: fmtPct, bench: "4.5–6.5%" },
          { label: "2-Year Stack Exp Rev Growth", key: null, fmt: () => "", bench: "9–13%" },
        ],
      },
      {
        accent: ACCENTS.other,
        metrics: [
          { label: "PEG Ratio", key: (s) => s.peg, fmt: fmtX, lowerIsBetter: true, bench: "1–1.5" },
          { label: "Return on Equity", key: (s) => s.roe, fmt: fmtPct, bench: "15–21%" },
          { label: "Price to Book", key: (s) => s.pb, fmt: fmtX, lowerIsBetter: true, bench: "3–4" },
          { label: "Price to Free Cash Flow", key: (s) => s.pFcf, fmt: fmtX, lowerIsBetter: true, bench: "20–25" },
          { label: "Free Cash Flow Yield", key: (s) => s.fcfYield, fmt: (v) => fmtPct(v, true), bench: "3–6%" },
          { label: "Dividend Yield", key: (s) => s.divYield, fmt: (v) => fmtPct(v, true), bench: "1.5–2.1%" },
          { label: "Dividend Payout Ratio", key: (s) => s.payoutRatio, fmt: (v) => fmtPct(v, true), bench: "32–42%" },
        ],
      },
    ],
  },
  {
    title: "QUALITY, RISK & RETURNS",
    groups: [
      {
        accent: ACCENTS.margins,
        metrics: [
          { label: "Operating Margin", key: (s) => s.opMargin, fmt: fmtPct },
          { label: "Piotroski F-Score", key: (s) => s.fScore, fmt: (v) => (v == null ? "N/A" : `${v} / 9`), bench: "7–9 is strong" },
          { label: "Altman Z-Score", key: (s) => s.altmanZ, fmt: (v) => fmt(v, 1), bench: "Above 3 is safe" },
        ],
      },
      {
        accent: ACCENTS.other,
        metrics: [
          { label: "Debt / Equity", key: (s) => s.debtEquity, fmt: fmtX, lowerIsBetter: true, bench: "0.5–1.5" },
          { label: "Current Ratio", key: (s) => s.currentRatio, fmt: fmtX, bench: "1.5–3.0" },
          { label: "Net Debt", key: (s) => s.netDebt, fmt: fmtLarge, lowerIsBetter: true },
          { label: "Operating Cash Flow", key: (s) => s.operatingCF, fmt: fmtLarge },
          { label: "Beta", key: (s) => s.beta, fmt: (v) => fmt(v, 2), lowerIsBetter: true, bench: "1.0 = market" },
          { label: "1-Year Return", key: (s) => s.ret1Y, fmt: (v) => fmtPct(v, true) },
          { label: "5-Year Return", key: (s) => s.ret5Y, fmt: (v) => fmtPct(v, true) },
        ],
      },
    ],
  },
];

/** Every metric across all groups — used by the scorecard and best-value logic. */
const ALL_METRICS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.metrics));

/** Flatten the /api/marketstack-stock payload into the shape the table reads. */
function normalize(j: any) {
  const f = j.fundamentals ?? {};
  const fw = j.forward ?? null;
  const r = (yrs: number) => j.longReturns?.find((x: any) => x.years === yrs && x.available)?.totalPct ?? null;
  return {
    // Projected off SEC-filed results, not analyst consensus — rows using these
    // are flagged `modeled` so the table never passes them off as estimates.
    forwardPe: fw?.pe ?? null,
    forwardPe2y: fw?.eps2y && j.quote?.price ? j.quote.price / fw.eps2y : null,
    forwardEpsGrowth: fw?.growth ?? null,
    forwardEpsGrowth2y: fw?.growth != null ? Math.pow(1 + fw.growth, 2) - 1 : null,
    ticker: j.ticker,
    name: j.profile?.name ?? j.ticker,
    sector: j.profile?.sector ?? null,
    exchange: j.profile?.exchange ?? null,
    price: j.quote?.price ?? null,
    changePct: j.quote?.changePct ?? null,
    mktCap: f.marketCap ?? null,
    peRatio: f.peRatio ?? null,
    peg: f.pegRatio ?? null,
    ps: f.ps ?? null,
    pb: f.pb ?? null,
    pFcf: f.pfcf ?? null,
    fcfYield: f.fcfYield != null ? f.fcfYield * 100 : null,
    epsGrowthTtm: f.epsGrowth ?? null,
    revenueGrowth: f.revenueGrowth ?? null,
    lastYearEpsGrowth: f.lastYearEpsGrowth ?? null,
    lastYearRevGrowth: f.lastYearRevGrowth ?? null,
    currentQuarterEpsGrowth: f.currentQuarterEpsGrowth ?? null,
    currentQuarterRevGrowth: f.currentQuarterRevGrowth ?? null,
    payoutRatio: j.dividends?.payoutRatioPct ?? null,
    grossMargin: f.grossMargin ?? null,
    opMargin: f.operatingMargin ?? null,
    netMargin: f.netMargin ?? null,
    roe: f.roe ?? null,
    debtEquity: f.debtToEquity ?? null,
    currentRatio: f.currentRatio ?? null,
    netDebt: f.netDebt ?? null,
    operatingCF: f.ocf ?? null,
    fScore: f.piotroski?.score ?? null,
    altmanZ: f.altmanZ ?? null,
    beta: j.capm?.beta ?? null,
    divYield: j.dividends?.yieldPct ?? null,
    ret1Y: r(1),
    ret5Y: r(5),
    price1Y: j.price ?? [],
  };
}

function TickerInput({ value, onChange, placeholder, required }: {
  value: string; onChange: (v: string) => void; placeholder: string; required?: boolean;
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} placeholder={placeholder} required={required}
      style={{
        width: 100, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22,
        padding: "9px 12px", color: "var(--text-primary)", fontFamily: MONO,
        fontSize: "0.82rem", outline: "none", textTransform: "uppercase",
      }} />
  );
}

function OverviewCard({ stock, color }: { stock: any; color: string }) {
  const chg = stock.changePct;
  return (
    <div style={{
      flex: 1, minWidth: 180, background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderTop: `3px solid ${color}`, borderRadius: 22, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <CompanyLogo ticker={stock.ticker} size={28} />
        <Link href={`/research?ticker=${stock.ticker}`} title={`Research ${stock.ticker}`} style={{
          fontFamily: MONO, fontSize: "0.72rem", fontWeight: 700,
          background: `${color}22`, color, border: `1px solid ${color}55`,
          borderRadius: 24, padding: "2px 7px", textDecoration: "none",
        }}>{stock.ticker}</Link>
        {stock.sector && (
          <span style={{ fontFamily: SANS, fontSize: "0.60rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{stock.sector}</span>
        )}
      </div>
      <div style={{ fontFamily: SANS, fontSize: "0.82rem", fontWeight: 500, marginBottom: 8, lineHeight: 1.3 }}>{stock.name}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.4rem", fontWeight: 600, marginBottom: 4 }}>${fmt(stock.price)}</div>
      <div style={{ fontFamily: MONO, fontSize: "0.78rem", marginBottom: 8, color: chg == null ? "var(--text-secondary)" : chg >= 0 ? "var(--positive)" : "var(--negative)" }}>
        {chg != null ? `${chg >= 0 ? "+" : "-"}${Math.abs(chg).toFixed(2)}%` : "N/A"}
      </div>
      <div style={{ fontFamily: SANS, fontSize: "0.68rem", color: "var(--text-secondary)" }}>
        Mkt Cap: {fmtLarge(stock.mktCap)}
      </div>
    </div>
  );
}

function EmptyHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 22, padding: "16px 18px", marginBottom: 12, opacity: 0.7 }}>
      <div style={{ fontFamily: SANS, fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{desc}</div>
    </div>
  );
}

function CompareInner() {
  const search = useSearchParams();
  // Seeded from the URL at first render rather than written back in an effect,
  // so the tickers paint before their data arrives. A bare visit falls back to
  // a default trio so the page demonstrates itself instead of opening empty;
  // those three stay hot in the edge cache precisely because they're the
  // default, so the fallback costs a cache hit rather than a cold fetch.
  const deepLink = React.useMemo(
    () => (search.get("t") ?? DEFAULT_TICKERS).split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_TICKERS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [tickers, setTickers] = useState<string[]>(
    () => [...deepLink, "", "", "", "", ""].slice(0, MAX_TICKERS)
  );
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");
  const [range, setRange] = useState<RangeKey>("1Y");
  const booted = useRef(false);

  const setTicker = (i: number, v: string) =>
    setTickers((p) => p.map((x, idx) => (idx === i ? v : x)));

  async function run(list: string[]) {
    const want = list.map((t) => t.trim().toUpperCase()).filter(Boolean).slice(0, MAX_TICKERS);
    if (want.length < 2) { setError("Enter at least two tickers."); return; }
    setLoading(true); setError(null);
    try {
      const out = await Promise.all(
        want.map(async (t) => {
          const res = await fetch(`/api/marketstack-stock/${t}`);
          const j = await res.json();
          if (!res.ok || j.error) throw new Error(`${t}: ${j.error ?? "not found"}`);
          return normalize(j);
        })
      );
      setStocks(out);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load"); setStocks([]);
    } finally { setLoading(false); }
  }

  // Only a ?t= deep link auto-runs. Arriving at /compare with nothing to compare
  // used to fetch AAPL and MSFT anyway, which spent two upstream round trips on
  // a pair the visitor never asked for and hid the empty state below. Bare
  // visits now land on the placeholders, matching the research page.
  useEffect(() => {
    if (booted.current) return;
    if (!deepLink.length) return;
    // run() flips loading state on its first line; scheduling it keeps that out
    // of the effect body so the initial paint isn't a cascading render. The
    // guard is set when the timer fires rather than up front — setting it here
    // would let StrictMode's mount/cleanup/mount cancel the scheduled run and
    // then skip it, which only shows up in development.
    const id = setTimeout(() => { booted.current = true; run(deepLink); }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Normalized % return series, aligned on dates present for every ticker ──
  const perfData = React.useMemo(() => {
    if (stocks.length < 2) return [];
    const cutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const windows = stocks.map((s) =>
      sliceRange<any>((s.price1Y ?? []).filter((p: any) => p.date >= cutoff), range)
    );
    if (windows.some((w) => w.length < 10)) return [];
    const maps = windows.map((w) => new Map(w.map((p: any) => [p.date, p.price])));
    const bases = windows.map((w) => w[0].price);
    // Intersection keeps the lines honest — a date missing for one ticker would
    // otherwise render as a gap mid-race.
    const dates = windows[0]
      .map((p: any) => p.date)
      .filter((d: string) => maps.every((m) => m.has(d)));
    return dates.map((d: string) => {
      const row: any = { date: d };
      stocks.forEach((s, i) => {
        const v = maps[i].get(d) as number;
        row[s.ticker] = ((v - bases[i]) / bases[i]) * 100;
      });
      return row;
    });
  }, [stocks, range]);

  const bestIdx = (m: MetricDef): number => {
    if (!m.key) return -1;
    let best = -1, bestV: number | null = null;
    stocks.forEach((s, i) => {
      const v = m.key!(s);
      if (v == null || !isFinite(v)) return;
      if (bestV == null || (m.lowerIsBetter ? v < bestV : v > bestV)) { bestV = v; best = i; }
    });
    return best;
  };

  // Scorecard bands, named for what they actually measure rather than the
  // table's section headings.
  const SCORE_BANDS: { title: string; pick: (m: MetricDef) => boolean }[] = [
    { title: "VALUATION", pick: (m) => /P\/E|P\/S|PEG|Price to Book|Price to Free/i.test(m.label) },
    { title: "GROWTH", pick: (m) => /Growth/i.test(m.label) },
    { title: "PROFITABILITY", pick: (m) => /Margin|Return on Equity|Free Cash Flow Yield/i.test(m.label) },
    { title: "HEALTH", pick: (m) => /Debt|Current Ratio|Cash Flow$|F-Score|Z-Score/i.test(m.label) },
  ];
  const scorecard = SCORE_BANDS.map((band) => {
    const scored = ALL_METRICS.filter((m) => m.key && band.pick(m));
    const wins = stocks.map(() => 0);
    scored.forEach((m) => { const b = bestIdx(m); if (b >= 0) wins[b]++; });
    const top = Math.max(...wins, 0);
    const tied = wins.filter((w) => w === top).length > 1 || top === 0;
    return { title: band.title, wins, winnerIdx: tied ? -1 : wins.indexOf(top), total: scored.length };
  });

  return (
    <div style={{ paddingBottom: "4rem", fontFamily: SANS, color: "var(--text-primary)" }}>
      
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Compare Stocks
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Side-by-side valuation · growth · profitability · health
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(tickers); }}
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: "2rem" }}>
        {Array.from({ length: MAX_TICKERS }, (_, i) => (
          <TickerInput key={i} value={tickers[i] ?? ""} onChange={(v) => setTicker(i, v)}
            placeholder={i === 0 ? "AAPL" : i === 1 ? "MSFT" : `Ticker ${i + 1}`} required={i < 2} />
        ))}
        <button type="submit" style={{
          background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22,
          padding: "9px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
        }}>Compare</button>
        {loading && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Loading…</span>}
      </form>
      {error && <div style={{ color: "var(--negative)", fontSize: "0.82rem", marginBottom: 16 }}>{error}</div>}

      {!loading && stocks.length === 0 && !error && (
        <>
          <EmptyHint title="Side-by-Side Overview" desc="Price, market cap, and daily move for each ticker, color-coded per company." />
          <EmptyHint title="1-Year Performance Race" desc="Each ticker's percentage return overlaid on one chart." />
          <EmptyHint title="Category Scorecard" desc="Who wins Valuation, Growth, Profitability, and Health — metric by metric." />
          <EmptyHint title="Metric Comparison Table" desc="Valuation, growth, profitability, and balance-sheet health — best value starred in each row." />
        </>
      )}

      {stocks.length >= 2 && (
        <>
          {/* Overview row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "2rem" }}>
            {stocks.map((s, i) => <OverviewCard key={s.ticker} stock={s} color={COLORS[i]} />)}
          </div>

          {/* 1Y performance race */}
          {(perfData.length > 10 || chartMode === "tv") && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "20px 16px", marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div style={{ fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)" }}>
                  Performance — % Return
                </div>
                <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* Only windows the 1-year series actually covers */}
                  {chartMode === "builtin" && (
                    <RangeToggle range={range} onChange={setRange} ranges={["1M", "3M", "6M", "YTD", "1Y"]} />
                  )}
                  <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                </div>
              </div>
              {chartMode === "builtin" ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={perfData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="date" tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false}
                      tickFormatter={(d: any) => String(d).slice(0, 7)} minTickGap={70} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                      labelStyle={{ color: "var(--text-primary)" }} itemStyle={{ color: "var(--text-primary)" }}
                      contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 22, fontFamily: "Spline Sans Mono", fontSize: 12 }}
                      formatter={(v: any, name: any) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontFamily: "Spline Sans Mono", fontSize: 13 }} />
                    {stocks.map((s, i) => (
                      <Line key={s.ticker} type="monotone" dataKey={s.ticker} stroke={COLORS[i]} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <CompareChart tickers={stocks.map((s) => s.ticker)} />
              )}
            </div>
          )}

          {/* Category scorecard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 92vw), 1fr))", gap: 12, marginBottom: "2rem" }}>
            {scorecard.map((card) => (
              <div key={card.title} style={{
                background: "var(--bg-surface)", border: "1px solid var(--border)",
                borderTop: `2px solid ${card.winnerIdx >= 0 ? COLORS[card.winnerIdx] : "var(--border)"}`,
                borderRadius: 22, padding: "14px 16px",
              }}>
                <div style={{ fontSize: "0.56rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 6 }}>
                  {card.title} WINNER
                </div>
                <div style={{ fontFamily: MONO, fontSize: "1.3rem", fontWeight: 700, color: card.winnerIdx >= 0 ? COLORS[card.winnerIdx] : "var(--text-secondary)" }}>
                  {card.winnerIdx >= 0 ? stocks[card.winnerIdx].ticker : "Tie"}
                </div>
                <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 3 }}>
                  {card.winnerIdx >= 0 ? `Wins ${card.wins[card.winnerIdx]} of ${card.total} metrics` : `Even split across ${card.total} metrics`}
                </div>
              </div>
            ))}
          </div>

          {/* Metrics table */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22, marginBottom: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.80rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ textAlign: "left", padding: "9px 14px", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", minWidth: 140 }}>Metric</th>
                  {stocks.map((s, i) => (
                    <th key={s.ticker} style={{ textAlign: "right", padding: "9px 14px", fontFamily: MONO, fontSize: "0.78rem", fontWeight: 700, color: COLORS[i], borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {s.ticker}
                    </th>
                  ))}
                  <th style={{ textAlign: "left", padding: "9px 14px", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", minWidth: 150 }}>
                    Typical Range
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((section) => (
                  <React.Fragment key={section.title}>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      <td colSpan={stocks.length + 2} style={{ padding: "6px 14px", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)" }}>
                        {section.title}
                      </td>
                    </tr>
                    {section.groups.map((group, gi) =>
                      group.metrics.map((metric, mi) => {
                        const best = bestIdx(metric);
                        const unavailable = !metric.key;
                        // A blank row between colour bands, mirroring the
                        // grouped blocks in the reference layout.
                        const firstOfGroup = mi === 0 && gi > 0;
                        return (
                          <React.Fragment key={metric.label}>
                            {firstOfGroup && (
                              <tr><td colSpan={stocks.length + 2} style={{ height: 8, background: "var(--bg-primary)" }} /></tr>
                            )}
                            <tr style={{ background: mi % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                              <td style={{
                                padding: "8px 14px", fontFamily: SANS, fontSize: "0.76rem",
                                borderBottom: "1px solid var(--border)",
                                borderLeft: `3px solid ${group.accent}`,
                                color: unavailable ? "var(--text-muted)" : "var(--text-primary)",
                              }}>
                                {metric.label}
                                {metric.modeled && (
                                  <span
                                    title="Projected from SEC-filed results by Prometheon's trend model — not analyst consensus."
                                    style={{
                                      marginLeft: 7, fontFamily: MONO, fontSize: "0.6rem", fontWeight: 700,
                                      color: "var(--text-muted)", border: "1px solid var(--border)",
                                      borderRadius: 999, padding: "1px 6px", cursor: "help", whiteSpace: "nowrap",
                                    }}
                                  >~est</span>
                                )}
                              </td>
                              {unavailable ? (
                                <td colSpan={stocks.length} style={{ textAlign: "right", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                                  <span style={{ fontFamily: SANS, fontSize: "0.68rem", fontWeight: 600, color: "var(--accent-gold)" }}>
                                    Not available with current data
                                  </span>
                                </td>
                              ) : (
                                stocks.map((s, si) => {
                                  const val = metric.key!(s);
                                  const isBest = si === best && val != null;
                                  return (
                                    <td key={s.ticker} style={{ textAlign: "right", padding: "8px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                                      <span style={{ color: isBest ? "var(--positive)" : "var(--text-secondary)", fontWeight: isBest ? 600 : undefined }}>
                                        {isBest && <span style={{ color: "var(--accent-gold)", marginRight: 4 }}>★</span>}
                                        {metric.fmt(val)}
                                      </span>
                                    </td>
                                  );
                                })
                              )}
                              <td style={{
                                padding: "8px 14px", borderBottom: "1px solid var(--border)",
                                fontFamily: SANS, fontSize: "0.63rem", fontWeight: 500,
                                textTransform: "uppercase", letterSpacing: "0.07em",
                                color: "var(--text-muted)", whiteSpace: "nowrap",
                              }}>
                                {metric.bench ? `Many stocks: ${metric.bench}` : ""}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Forward P/E and forward EPS growth need analyst estimates, which marketstack doesn&apos;t carry —
            trailing EPS growth is shown in their place. Everything else: marketstack prices &amp; ratings,
            SEC EDGAR fundamentals.
          </div>
        </>
      )}
    </div>
  );
}

export default function MsComparePage() {
  return <Suspense fallback={null}><CompareInner /></Suspense>;
}
