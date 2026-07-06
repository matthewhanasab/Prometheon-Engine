"use client";
import React, { useState } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip,
} from "recharts";

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

const COLORS = ["#3B82F6", "#C9A84C", "#22C55E", "#7b61ff"];

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
      { label: "EPS Growth",     key: s => s.epsGrowth,     fmt: fmtPct, lowerIsBetter: false },
      { label: "Revenue Growth", key: s => s.revenueGrowth, fmt: fmtPct, lowerIsBetter: false },
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
function normalize(values: (number | null)[], lowerIsBetter: boolean): number[] {
  const valid = values.filter((v): v is number => v != null && isFinite(v));
  if (valid.length === 0) return values.map(() => 50);
  const mn = Math.min(...valid);
  const mx = Math.max(...valid);
  if (mn === mx) return values.map(() => 50);
  return values.map(v => {
    if (v == null || !isFinite(v)) return 0;
    const norm = (v - mn) / (mx - mn); // 0–1, higher = larger value
    return Math.round((lowerIsBetter ? 1 - norm : norm) * 100);
  });
}

const RADAR_DIMS: { label: string; key: (s: any) => number | null; lowerIsBetter?: boolean }[] = [
  { label: "Rev Growth",  key: s => s.revenueGrowth, lowerIsBetter: false },
  { label: "Net Margin",  key: s => s.netMargin,     lowerIsBetter: false },
  { label: "ROE",         key: s => s.roe,           lowerIsBetter: false },
  { label: "FCF Yield",   key: s => s.fcfYield,      lowerIsBetter: false },
  { label: "Value(PE)",   key: s => s.peRatio,       lowerIsBetter: true  },
  { label: "Value(PS)",   key: s => s.ps,            lowerIsBetter: true  },
  { label: "Low Debt",    key: s => s.debtEquity,    lowerIsBetter: true  },
  { label: "EPS Growth",  key: s => s.epsGrowth,     lowerIsBetter: false },
];

function buildRadarData(stocks: any[]) {
  return RADAR_DIMS.map(dim => {
    const rawVals = stocks.map(s => dim.key(s));
    const normed  = normalize(rawVals, dim.lowerIsBetter ?? false);
    const entry: Record<string, number | string> = { subject: dim.label };
    stocks.forEach((s, i) => { entry[s.ticker] = normed[i]; });
    return entry;
  });
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
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4,
        padding: "9px 12px", color: "var(--text-primary)", fontFamily: "'IBM Plex Mono',monospace",
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
      borderTop: `3px solid ${color}`, borderRadius: 4, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{
          fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.72rem", fontWeight: 700,
          background: `${color}22`, color, border: `1px solid ${color}55`,
          borderRadius: 3, padding: "2px 7px",
        }}>{stock.ticker}</span>
        {stock.sector && (
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: "0.60rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{stock.sector}</span>
        )}
      </div>
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: "0.82rem", fontWeight: 500, color: "var(--text-primary)", marginBottom: 8, lineHeight: 1.3 }}>{stock.name}</div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "1.4rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
        ${fmt(stock.price)}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.78rem", color: chg == null ? "var(--text-secondary)" : chg >= 0 ? "var(--positive)" : "var(--negative)", marginBottom: 8 }}>
        {chg != null ? `${chg >= 0 ? "+" : "-"}${Math.abs(chg).toFixed(2)}%` : "N/A"}
      </div>
      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: "0.68rem", color: "var(--text-secondary)" }}>
        Mkt Cap: {fmtLarge(stock.mktCap)}
      </div>
    </div>
  );
}

// â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ComparePage() {
  const [tickers, setTickers] = useState(["AAPL", "MSFT", "", ""]);
  const [stocks, setStocks]   = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  function setTicker(i: number, v: string) {
    setTickers(prev => { const n = [...prev]; n[i] = v; return n; });
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

  const radarData = stocks.length >= 2 ? buildRadarData(stocks) : [];

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Compare Stocks
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "1.5rem", fontFamily: "'Inter',sans-serif" }}>
        Side-by-side valuation · growth · profitability · health
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: "2rem" }}>
        {[0, 1, 2, 3].map(i => (
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
            background: "var(--accent-gold)", color: "#0A0F1E", border: "none", borderRadius: 4,
            padding: "9px 22px", fontFamily: "'Inter',sans-serif", fontSize: "0.72rem",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
          }}
        >Compare</button>
        {loading && <span style={{ fontFamily: "'Inter',sans-serif", fontSize: "0.78rem", color: "var(--text-secondary)" }}>Loading…</span>}
      </form>
      {error && <div style={{ color: "var(--negative)", fontSize: "0.82rem", marginBottom: 16 }}>{error}</div>}

      {!loading && stocks.length === 0 && !error && (
        <div style={{ marginTop: "5rem", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: "1.1rem", color: "var(--text-secondary)", marginBottom: 8 }}>Enter 2–4 tickers to compare</div>
          <div style={{ fontSize: "0.70rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>Powered by Financial Modeling Prep</div>
        </div>
      )}

      {stocks.length >= 2 && (
        <>
          {/* Overview row */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "2rem" }}>
            {stocks.map((s, i) => (
              <OverviewCard key={s.ticker} stock={s} color={COLORS[i]} />
            ))}
          </div>

          {/* Metrics table */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4, marginBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.80rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ textAlign: "left", padding: "9px 14px", fontFamily: "'Inter',sans-serif", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", minWidth: 140 }}>Metric</th>
                  {stocks.map((s, i) => (
                    <th key={s.ticker} style={{ textAlign: "right", padding: "9px 14px", fontFamily: "'IBM Plex Mono',monospace", fontSize: "0.78rem", fontWeight: 700, color: COLORS[i], borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {s.ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map(section => (
                  <React.Fragment key={section.title}>
                    <tr style={{ background: "var(--bg-elevated)" }}>
                      <td colSpan={stocks.length + 1} style={{ padding: "6px 14px", fontFamily: "'Inter',sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)" }}>
                        {section.title}
                      </td>
                    </tr>
                    {section.metrics.map((metric, mi) => {
                      const best = bestIdx(metric);
                      return (
                        <tr key={metric.label} style={{ background: mi % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                          <td style={{ padding: "8px 14px", color: "var(--text-primary)", fontFamily: "'Inter',sans-serif", fontSize: "0.78rem", borderBottom: "1px solid var(--border)" }}>
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

          {/* Radar chart */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "20px 16px" }}>
            <div style={{ fontFamily: "'Inter',sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 16 }}>
              Multi-Dimensional Comparison — Normalized 0–100
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <RadarChart data={radarData} margin={{ top: 10, right: 40, bottom: 10, left: 40 }}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "IBM Plex Mono" }}
                />
                {stocks.map((s, i) => (
                  <Radar
                    key={s.ticker}
                    name={s.ticker}
                    dataKey={s.ticker}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.10}
                    strokeWidth={2}
                  />
                ))}
                <Legend
                  wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{ background: "#1C2333", border: "1px solid #2E4A6E", borderRadius: 4, fontFamily: "IBM Plex Mono", fontSize: 12, color: "#F1F5F9" }}
                  formatter={(v: any) => [`${v}/100`]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

