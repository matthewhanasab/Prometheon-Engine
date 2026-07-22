"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import Link from "next/link";
import CompareChart from "@/components/CompareChart";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";
import CompanyLogo from "@/components/CompanyLogo";

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(d);
}
function fmtX(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  return `${n.toFixed(2)}×`;
}
function fmtPct(n: number | null | undefined, alreadyPct = false) {
  if (n == null || isNaN(n)) return "N/A";
  return `${(alreadyPct ? n : n * 100).toFixed(2)}%`;
}
function fmtLarge(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

const COLORS = ["#3B82F6", "var(--accent-gold)", "#22C55E", "#A78BFA", "#F97316"];
const MAX_TICKERS = 5;

// â”€â”€ Metric config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type MetricDef = {
  label: string;
  key: (s: any) => number | null;
  fmt: (v: number | null) => string;
  // lowerIsBetter: true means lower value is "best" (green star)
  lowerIsBetter?: boolean;
};

const SECTIONS: { title: string; metrics: MetricDef[] }[] = [
  {
    title: "VALUATION",
    metrics: [
      { label: "P/E Ratio",    key: s => s.peRatio,    fmt: fmtX,  lowerIsBetter: true },
      { label: "Fwd P/E",      key: s => s.fwdPE,      fmt: fmtX,  lowerIsBetter: true },
      { label: "PEG",          key: s => s.peg,         fmt: fmtX,  lowerIsBetter: true },
      { label: "P/S",          key: s => s.ps,          fmt: fmtX,  lowerIsBetter: true },
      { label: "P/B",          key: s => s.pb,          fmt: fmtX,  lowerIsBetter: true },
      { label: "P/FCF",        key: s => s.pFcf,        fmt: fmtX,  lowerIsBetter: true },
      { label: "FCF Yield",    key: s => s.fcfYield,    fmt: v => fmtPct(v, true), lowerIsBetter: false },
    ],
  },
  {
    title: "GROWTH",
    metrics: [
      { label: "EPS Growth (fwd)",     key: s => s.epsGrowth,     fmt: fmtPct, lowerIsBetter: false },
      { label: "Revenue Growth (YoY)", key: s => s.revenueGrowth, fmt: fmtPct, lowerIsBetter: false },
    ],
  },
  {
    title: "PROFITABILITY",
    metrics: [
      { label: "Gross Margin", key: s => s.grossMargin, fmt: fmtPct, lowerIsBetter: false },
      { label: "Op Margin",    key: s => s.opMargin,    fmt: fmtPct, lowerIsBetter: false },
      { label: "Net Margin",   key: s => s.netMargin,   fmt: fmtPct, lowerIsBetter: false },
      { label: "ROE",          key: s => s.roe,         fmt: fmtPct, lowerIsBetter: false },
    ],
  },
  {
    title: "HEALTH",
    metrics: [
      { label: "D/E Ratio",    key: s => s.debtEquity,  fmt: fmtX,      lowerIsBetter: true },
      { label: "Current Ratio",key: s => s.currentRatio,fmt: fmtX,      lowerIsBetter: false },
      { label: "Net Debt",     key: s => s.netDebt,     fmt: fmtLarge,  lowerIsBetter: true },
      { label: "Op Cash Flow", key: s => s.operatingCF, fmt: fmtLarge,  lowerIsBetter: false },
    ],
  },
  {
    title: "OTHER",
    metrics: [
      { label: "Beta",      key: s => s.beta,     fmt: v => fmt(v, 2), lowerIsBetter: true },
      { label: "Div Yield", key: s => s.divYield, fmt: fmtPct,          lowerIsBetter: false },
    ],
  },
];

// â”€â”€ Radar normalization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Score a value against absolute benchmarks (0-100). With min/max normalization
// two stocks always come out 100 vs 0 - benchmarks keep the shape meaningful.
function score(v: number | null, lo: number, hi: number, invert = false): number {
  if (v == null || !isFinite(v)) return 0;
  let n = (v - lo) / (hi - lo);
  n = Math.max(0, Math.min(1, n));
  if (invert) n = 1 - n;
  return Math.round(n * 100);
}

const RADAR_DIMS: { label: string; calc: (s: any) => number }[] = [
  { label: "Rev Growth", calc: s => score((s.revenueGrowth ?? null) != null ? s.revenueGrowth * 100 : null, 0, 30) },
  { label: "Net Margin", calc: s => score((s.netMargin ?? null) != null ? s.netMargin * 100 : null, 0, 30) },
  { label: "ROE",        calc: s => score((s.roe ?? null) != null ? s.roe * 100 : null, 0, 40) },
  { label: "FCF Yield",  calc: s => score(s.fcfYield ?? null, 0, 6) },
  { label: "Value (P/E)", calc: s => score(s.peRatio ?? null, 10, 50, true) },
  { label: "Value (P/S)", calc: s => score(s.ps ?? null, 2, 20, true) },
  { label: "Low Debt",   calc: s => score(s.debtEquity ?? null, 0, 2, true) },
  { label: "EPS Growth", calc: s => score((s.epsGrowth ?? null) != null ? s.epsGrowth * 100 : null, 0, 30) },
];

// 1Y performance: % change rebased from each stock's price ~12 months ago.
// FMP's `limit` counts trading rows (~365 rows ≈ 1.45 calendar years), so we
// clamp to a true trailing 12 months before rebasing to keep the label honest.
function buildPerfData(stocks: any[]) {
  const rows = new Map<string, Record<string, number | string>>();
  for (const s of stocks) {
    const full = (s.priceHistory ?? []) as { date: string; price: number }[];
    if (full.length < 2) continue;
    // History is ascending; the last point is the most recent.
    const lastDate = new Date(full[full.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const hist = full.filter(pt => new Date(pt.date) >= cutoff);
    if (hist.length < 2) continue;
    const base = hist[0].price;
    if (!base) continue;
    for (const pt of hist) {
      if (!rows.has(pt.date)) rows.set(pt.date, { date: pt.date });
      rows.get(pt.date)![s.ticker] = ((pt.price / base) - 1) * 100;
    }
  }
  return Array.from(rows.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Score -> cell color: red (weak) -> gold (middling) -> green (strong)
function scoreColor(score: number): { bg: string; fg: string } {
  if (score >= 70) return { bg: "rgba(46, 213, 115, 0.16)", fg: "#2ED573" };
  if (score >= 40) return { bg: "rgba(61, 230, 140, 0.14)", fg: "var(--accent-gold)" };
  return { bg: "rgba(240, 86, 74, 0.13)", fg: "#F0564A" };
}

function StrengthHeatmap({ stocks }: { stocks: any[] }) {
  const rows = RADAR_DIMS.map(dim => ({
    label: dim.label,
    scores: stocks.map(s => dim.calc(s)),
  }));
  const overall = stocks.map((_, i) =>
    Math.round(rows.reduce((sum, r) => sum + r.scores[i], 0) / rows.length)
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.82rem" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "8px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)" }}>Dimension</th>
            {stocks.map((s, i) => (
              <th key={s.ticker} style={{ textAlign: "center", padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                <Link href={`/research?ticker=${s.ticker}`} title={`Research ${s.ticker}`} style={{ color: COLORS[i], fontWeight: 700, textDecoration: "none" }}>{s.ticker}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label}>
              <td style={{ padding: "7px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-primary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>{row.label}</td>
              {row.scores.map((sc, i) => {
                const c = scoreColor(sc);
                return (
                  <td key={i} style={{ padding: "4px 8px", borderBottom: "1px solid var(--border)", textAlign: "center" }}>
                    <div style={{ background: c.bg, color: c.fg, borderRadius: 24, padding: "5px 0", fontWeight: 600, minWidth: 64 }}>{sc}</div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td style={{ padding: "9px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", fontWeight: 700, color: "var(--accent-gold)", whiteSpace: "nowrap" }}>Overall</td>
            {overall.map((sc, i) => {
              const c = scoreColor(sc);
              return (
                <td key={i} style={{ padding: "6px 8px", textAlign: "center" }}>
                  <div style={{ background: c.bg, color: c.fg, border: `1px solid ${c.fg}55`, borderRadius: 24, padding: "6px 0", fontWeight: 700, minWidth: 64, fontSize: "0.9rem" }}>{sc}</div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, padding: "0 4px" }}>
        Scored 0-100 against fixed benchmarks (e.g. 30%+ net margin = 100, P/E of 10 = 100, P/E of 50+ = 0). Green 70+, gold 40-69, red below 40.
      </div>
    </div>
  );
}

function GroupedBars({ title, data, stocks, unit }: {
  title: string; data: Record<string, number | string | null>[]; stocks: any[]; unit: string;
}) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "16px 14px", flex: 1, minWidth: 300 }}>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 12 }}>
        {title}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-primary)", fontSize: 12, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => `${v}${unit}`} tick={{ fill: "var(--tick)", fontSize: 11, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            cursor={{ fill: "var(--cursor-fill)" }}
            labelStyle={{ color: "var(--text-primary)" }} itemStyle={{ color: "var(--text-primary)" }}
            contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 22, fontFamily: "Spline Sans Mono", fontSize: 12 }}
            formatter={(v: any, name: any) => [`${Number(v).toFixed(1)}${unit}`, name]}
          />
          {stocks.map((s, i) => (
            <Bar key={s.ticker} dataKey={s.ticker} fill={COLORS[i]} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TickerInput({ value, onChange, placeholder, required }: {
  value: string; onChange: (v: string) => void; placeholder: string; required?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.toUpperCase())}
      placeholder={placeholder}
      required={required}
      style={{
        width: 100,
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22,
        padding: "9px 12px", color: "var(--text-primary)", fontFamily: "'Spline Sans Mono',monospace",
        fontSize: "0.82rem", outline: "none", textTransform: "uppercase",
      }}
    />
  );
}

function OverviewCard({ stock, color }: { stock: any; color: string }) {
  const chg = stock.changePct;
  return (
    <div style={{
      flex: 1, minWidth: 180,
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderTop: `3px solid ${color}`, borderRadius: 22, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <CompanyLogo ticker={stock.ticker} size={28} />
        <Link href={`/research?ticker=${stock.ticker}`} title={`Research ${stock.ticker}`} style={{
          fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.72rem", fontWeight: 700,
          background: `${color}22`, color, border: `1px solid ${color}55`,
          borderRadius: 24, padding: "2px 7px", textDecoration: "none",
        }}>{stock.ticker}</Link>
        {stock.sector && (
          <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{stock.sector}</span>
        )}
      </div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.3 }}>{stock.name}</div>
      <div style={{ fontFamily: "'Spline Sans Mono',monospace", fontSize: "1.4rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        ${fmt(stock.price)}
      </div>
      <div style={{ fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.78rem", color: chg == null ? "var(--text-secondary)" : chg >= 0 ? "var(--positive)" : "var(--negative)", marginBottom: 8 }}>
        {chg != null ? `${chg >= 0 ? "+" : "-"}${Math.abs(chg).toFixed(2)}%` : "N/A"}
      </div>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.68rem", color: "var(--text-secondary)" }}>
        Mkt Cap: {fmtLarge(stock.mktCap)}
      </div>
    </div>
  );
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EmptyHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>{title}</div>
      <div style={{ border: "1px dashed var(--border-active)", borderRadius: 22, background: "var(--bg-surface)", padding: "34px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)" }}>{desc}</span>
      </div>
    </div>
  );
}

function CompareInner() {
  const searchParams = useSearchParams();
  const [tickers, setTickers] = useState(["AAPL", "MSFT", "", "", ""]);
  const [stocks, setStocks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");

  function setTicker(i: number, v: string) {
    setTickers(prev => { const n = [...prev]; n[i] = v; return n; });
  }

  useEffect(() => {
    const q = searchParams.get("t");
    if (q) {
      const list = q.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX_TICKERS);
      if (list.length >= 2) {
        setTickers(Array.from({ length: MAX_TICKERS }, (_, i) => list[i] ?? ""));
        runCompare(list);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runCompare(active: string[]) {
    setLoading(true); setError(null); setStocks([]);
    try {
      const res = await fetch(`/api/compare?t=${active.join(",")}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStocks(data);
    } catch {
      setError("Failed to load comparison data. Check tickers and try again.");
    } finally { setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const active = tickers.filter(t => t.trim());
    if (active.length < 2) { setError("Enter at least 2 tickers."); return; }
    setLoading(true); setError(null); setStocks([]);
    try {
      const res = await fetch(`/api/compare?t=${active.join(",")}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStocks(data);
    } catch {
      setError("Failed to load comparison data. Check tickers and try again.");
    } finally { setLoading(false); }
  }

  // Find best value index for a metric
  function bestIdx(metric: MetricDef): number {
    const vals = stocks.map(s => metric.key(s));
    const valid = vals.map((v, i) => ({ v, i })).filter(x => x.v != null && isFinite(x.v!));
    if (valid.length === 0) return -1;
    if (metric.lowerIsBetter) {
      return valid.reduce((best, cur) => cur.v! < best.v! ? cur : best).i;
    } else {
      return valid.reduce((best, cur) => cur.v! > best.v! ? cur : best).i;
    }
  }


  const perfData = stocks.length >= 2 ? buildPerfData(stocks) : [];

  // Category scorecard: who wins the most metrics per section
  const scorecard = SECTIONS.filter(sec => sec.title !== "OTHER").map(sec => {
    const wins = stocks.map(() => 0);
    sec.metrics.forEach(m => { const b = bestIdx(m); if (b >= 0) wins[b]++; });
    const top = Math.max(...wins);
    const winnerIdx = wins.indexOf(top);
    const tied = wins.filter(w => w === top).length > 1;
    return { title: sec.title, wins, winnerIdx: tied ? -1 : winnerIdx, total: sec.metrics.length };
  });

  // Grouped-bar datasets (values in display units)
  const pct = (v: number | null | undefined) => (v == null ? null : v * 100);
  const marginBars = [
    { name: "Gross",     ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.grossMargin)])) },
    { name: "Operating", ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.opMargin)])) },
    { name: "Net",       ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.netMargin)])) },
    { name: "ROE",       ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.roe)])) },
  ];
  const growthBars = [
    { name: "Rev (YoY)", ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.revenueGrowth)])) },
    { name: "EPS (fwd)", ...Object.fromEntries(stocks.map(s => [s.ticker, pct(s.epsGrowth)])) },
  ];
  const valuationBars = [
    { name: "P/E",   ...Object.fromEntries(stocks.map(s => [s.ticker, s.peRatio ?? null])) },
    { name: "P/S",   ...Object.fromEntries(stocks.map(s => [s.ticker, s.ps ?? null])) },
    { name: "P/FCF", ...Object.fromEntries(stocks.map(s => [s.ticker, s.pFcf ?? null])) },
  ];

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Compare Stocks
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "1.5rem", fontFamily: "'Public Sans', sans-serif" }}>
        Side-by-side valuation · growth · profitability · health
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: "2rem" }}>
        {Array.from({ length: MAX_TICKERS }, (_, i) => (
          <TickerInput
            key={i}
            value={tickers[i]}
            onChange={v => setTicker(i, v)}
            placeholder={i === 0 ? "AAPL" : i === 1 ? "MSFT" : `Ticker ${i + 1}`}
            required={i < 2}
          />
        ))}
        <button
          type="submit"
          style={{
            background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22,
            padding: "9px 22px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
          }}
        >Compare</button>
        {loading && <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Loading…</span>}
      </form>
      {error && <div style={{ color: "var(--negative)", fontSize: "0.82rem", marginBottom: 16 }}>{error}</div>}

      {!loading && stocks.length === 0 && !error && (
        <>
          <EmptyHint title="Side-by-Side Overview" desc="Price, market cap, and daily move for each ticker, color-coded per company." />
          <EmptyHint title="1-Year Performance Race" desc="Each ticker&apos;s percentage return overlaid on one chart." />
          <EmptyHint title="Category Scorecard" desc="Who wins Valuation, Growth, Profitability, and Health — metric by metric." />
          <EmptyHint title="Metric Comparison Table" desc="Valuation, growth, profitability, and balance-sheet health — best value starred in each row." />
          <EmptyHint title="Strength Heatmap" desc="Eight dimensions scored 0-100 against fixed benchmarks, color-coded per company." />
        </>
      )}

      {stocks.length >= 2 && (
        <>
          {/* Overview row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "2rem" }}>
            {stocks.map((s, i) => (
              <OverviewCard key={s.ticker} stock={s} color={COLORS[i]} />
            ))}
          </div>

          {/* 1Y performance race */}
          {(perfData.length > 10 || chartMode === "tv") && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "20px 16px", marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)" }}>
                  1-Year Performance — % Return
                </div>
                <ChartModeToggle mode={chartMode} onChange={setChartMode} />
              </div>
              {chartMode === "builtin" ? (
                perfData.length > 10 ? (
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
                  <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)", padding: "40px 0", textAlign: "center" }}>
                    Not enough price history to plot.
                  </div>
                )
              ) : (
                <CompareChart tickers={stocks.map(s => s.ticker)} height={400} />
              )}
            </div>
          )}

          {/* Category scorecard */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: "2rem" }}>
            {scorecard.map(card => (
              <div key={card.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderTop: `2px solid ${card.winnerIdx >= 0 ? COLORS[card.winnerIdx] : "var(--border)"}`, borderRadius: 22, padding: "14px 16px" }}>
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 8 }}>
                  {card.title} Winner
                </div>
                <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.3rem", fontWeight: 700, color: card.winnerIdx >= 0 ? COLORS[card.winnerIdx] : "var(--text-secondary)" }}>
                  {card.winnerIdx >= 0 ? stocks[card.winnerIdx].ticker : "Tie"}
                </div>
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: 6 }}>
                  {card.winnerIdx >= 0
                    ? `Wins ${card.wins[card.winnerIdx]} of ${card.total} metrics`
                    : `Even split across ${card.total} metrics`}
                </div>
              </div>
            ))}
          </div>

          {/* Metrics table */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22, marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.80rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ textAlign: "left", padding: "9px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", minWidth: 140 }}>Metric</th>
                  {stocks.map((s, i) => (
                    <th key={s.ticker} style={{ textAlign: "right", padding: "9px 14px", fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.78rem", fontWeight: 700, color: COLORS[i], borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {s.ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(section => (
                  <React.Fragment key={section.title}>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      <td colSpan={stocks.length + 1} style={{ padding: "6px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)" }}>
                        {section.title}
                      </td>
                    </tr>
                    {section.metrics.map((metric, mi) => {
                      const best = bestIdx(metric);
                      return (
                        <tr key={metric.label} style={{ background: mi % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                          <td style={{ padding: "8px 14px", color: "var(--text-primary)", fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", borderBottom: "1px solid var(--border)" }}>
                            {metric.label}
                          </td>
                          {stocks.map((s, si) => {
                            const val = metric.key(s);
                            const isBest = si === best && val != null;
                            return (
                              <td key={s.ticker} style={{ textAlign: "right", padding: "8px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                                <span style={{ color: isBest ? "var(--positive)" : "var(--text-secondary)", fontWeight: isBest ? 600 : undefined }}>
                                  {isBest && <span style={{ color: "var(--accent-gold)", marginRight: 4 }}>★</span>}
                                  {metric.fmt(val)}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grouped bar comparisons */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "2rem" }}>
            <GroupedBars title="Profitability — %" data={marginBars} stocks={stocks} unit="%" />
            <GroupedBars title="Growth — Revenue YoY vs EPS forward, %" data={growthBars} stocks={stocks} unit="%" />
            <GroupedBars title="Valuation Multiples — lower is cheaper" data={valuationBars} stocks={stocks} unit="x" />
          </div>

          {/* Strength heatmap */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "20px 16px" }}>
            <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 16 }}>
              Strength Heatmap — 0-100 vs Fixed Benchmarks
            </div>
            <StrengthHeatmap stocks={stocks} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparePage() {
  return <Suspense fallback={null}><CompareInner /></Suspense>;
}
