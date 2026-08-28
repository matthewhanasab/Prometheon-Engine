"use client";
import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import CompanyLogo from "@/components/CompanyLogo";
import CompareChart from "@/components/CompareChart";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";

// Compare ETFs. The headline is the overlap matrix — how much two funds hold
// in common — because that's the question index investors actually have:
// "am I diversifying, or buying the same basket twice?"
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22 };
// Series colours must be distinguishable from each other, so they're literal
// rather than themed: --accent-gold resolves to a blue (#3b6eeb light /
// #6B9CFF dark) despite the name, which made fund 2 indistinguishable from
// fund 1 on the performance race.
const COLORS = ["#3B82F6", "#F59E0B", "#22C55E", "#A78BFA"];
const MAX = 4;

const money = (n: any) => (n == null || !isFinite(n) ? "—" : `$${Number(n).toFixed(2)}`);
const pctS = (n: any, d = 1) => (n == null || !isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(d)}%`);
const big = (n: any) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  return `$${a.toFixed(0)}`;
};
const ret = (f: any, y: number) => f.returns?.find((r: any) => r.years === y)?.totalPct ?? null;

// Overlap heat: green = independent (low overlap), red = redundant (high).
function overlapColor(pct: number): string {
  if (pct >= 70) return "var(--negative)";
  if (pct >= 30) return "var(--accent-gold)";
  return "var(--positive)";
}

function CompareInner() {
  const search = useSearchParams();
  const [tickers, setTickers] = useState<string[]>(["", "", "", ""]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");
  const booted = useRef(false);

  const setT = (i: number, v: string) => setTickers((p) => p.map((x, idx) => (idx === i ? v : x)));

  async function run(list: string[]) {
    const want = list.map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, MAX);
    if (want.length < 2) { setError("Enter at least two ETF tickers."); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/etf-compare?t=${want.join(",")}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed"); setData(null);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const q = (search.get("t") ?? "VOO,VTI,SCHD").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    setTickers([...q, "", "", "", ""].slice(0, MAX));
    run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const funds: any[] = data?.funds ?? [];
  const overlaps: any[] = data?.overlaps ?? [];
  const ov = (a: string, b: string) =>
    overlaps.find((o) => (o.a === a && o.b === b) || (o.a === b && o.b === a))?.pct ?? null;

  // Best (lowest) expense ratio among funds that have one — starred.
  const cheapest = Math.min(...funds.map((f) => (f.expenseRatio != null ? f.expenseRatio : Infinity)));

  const ROWS: { label: string; get: (f: any) => string; color?: (f: any) => string }[] = [
    { label: "Price", get: (f) => money(f.price) },
    {
      label: "Expense Ratio",
      get: (f) => (f.expenseRatio != null ? `${f.expenseRatio.toFixed(2)}%${f.expenseRatio === cheapest ? " ★" : ""}` : "—"),
      color: (f) => (f.expenseRatio != null && f.expenseRatio === cheapest ? "var(--positive)" : f.expenseRatio != null && f.expenseRatio > 0.4 ? "var(--negative)" : "var(--text-primary)"),
    },
    {
      label: "Cost per $10k / yr",
      get: (f) => (f.expenseRatio != null ? `$${(f.expenseRatio * 100).toFixed(0)}` : "—"),
    },
    { label: "Dividend Yield", get: (f) => (f.yieldPct != null ? `${f.yieldPct.toFixed(2)}%` : "—"), color: () => "var(--positive)" },
    { label: "Yield After Fees", get: (f) => (f.netYieldPct != null ? `${f.netYieldPct.toFixed(2)}%` : "—") },
    { label: "Net Assets", get: (f) => big(f.netAssets) },
    { label: "Holdings", get: (f) => (f.count != null ? String(f.count) : "—") },
    { label: "Effective Holdings", get: (f) => (f.effectiveHoldings != null ? String(Math.round(f.effectiveHoldings)) : "—") },
    { label: "Top-10 Weight", get: (f) => (f.top10Weight != null ? `${f.top10Weight.toFixed(1)}%` : "—") },
    { label: "Largest Position", get: (f) => (f.largestWeight != null ? `${f.largestWeight.toFixed(2)}%` : "—") },
    { label: "1-Year Return", get: (f) => pctS(ret(f, 1), 0), color: (f) => (ret(f, 1) >= 0 ? "var(--positive)" : "var(--negative)") },
    { label: "3-Year Return", get: (f) => pctS(ret(f, 3), 0), color: (f) => (ret(f, 3) >= 0 ? "var(--positive)" : "var(--negative)") },
    { label: "5-Year Return", get: (f) => pctS(ret(f, 5), 0), color: (f) => (ret(f, 5) >= 0 ? "var(--positive)" : "var(--negative)") },
    { label: "Securities on Loan", get: (f) => (f.onLoanPct != null ? `${f.onLoanPct.toFixed(2)}%` : "—") },
  ];

  const withHoldings = funds.filter((f) => f.holdingsAvailable);

  // Performance race: each fund's % return from a common start date, so the
  // lines all begin at 0 and diverge. Aligned on the intersection of dates
  // (a date missing for one fund would otherwise render as a gap).
  const perfData = useMemo(() => {
    // Slice to the selected timeframe FIRST, then rebase — so every range
    // starts its lines at 0 and shows the return over that window specifically.
    const charts = funds.map((f) => sliceRange(f.chart ?? [], range));
    const series = charts.filter((c) => c.length > 5);
    if (series.length < 2 || series.length !== funds.length) return [];
    const maps = charts.map((c) => new Map(c.map((p: any) => [p.date, p.price])));
    // Common window starts at the latest first-date across funds (younger ETFs
    // shorten the race so everyone is measured over the same span).
    const starts = charts.map((c) => c[0]?.date ?? "9999");
    const commonStart = starts.reduce((a: string, b: string) => (a > b ? a : b), "0000");
    const dates = charts[0]
      .map((p: any) => p.date)
      .filter((d: string) => d >= commonStart && maps.every((m) => m.has(d)));
    const bases = maps.map((m) => m.get(dates[0]) as number);
    return dates.map((d: string) => {
      const row: any = { date: d };
      funds.forEach((f, i) => {
        const v = maps[i].get(d) as number;
        if (v != null && bases[i]) row[f.ticker] = ((v - bases[i]) / bases[i]) * 100;
      });
      return row;
    });
  }, [funds, range]);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Compare ETFs
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Side-by-side yield, returns and concentration — plus how much the funds actually hold in common.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(tickers); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: "1.4rem" }}>
        {Array.from({ length: MAX }, (_, i) => (
          <input key={i} value={tickers[i] ?? ""} onChange={(e) => setT(i, e.target.value.toUpperCase())}
            placeholder={i < 2 ? ["VOO", "VTI"][i] : `ETF ${i + 1}`}
            style={{ width: 92, background: "var(--bg-elevated)", border: `1px solid ${tickers[i] ? COLORS[i] : "var(--border)"}`, borderRadius: 22, padding: "9px 12px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.82rem", outline: "none", textTransform: "uppercase" }} />
        ))}
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "9px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "…" : "Compare"}
        </button>
      </form>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</p>}

      {/* Comparing several funds means a holdings pull each plus the pairwise
          overlap, so the first uncached load takes seconds. Nothing rendered
          during that wait except a "…" on the button, which reads as a broken
          page rather than a busy one. */}
      {(loading || (!data && !error)) && (
        <>
          {[
            { t: "Overview", d: "Price, assets, yield and expense ratio for each fund." },
            { t: "Performance", d: "1, 3, 5 and 10-year total return and CAGR, charted together." },
            { t: "Holdings overlap", d: "How much of each pair of funds is the same underlying stock." },
            { t: "Top holdings", d: "Largest positions in each fund, side by side." },
          ].map((s) => (
            <div key={s.t} style={{ ...CARD, border: "1px dashed var(--border)", padding: "16px 18px", marginBottom: 12, opacity: 0.7 }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 5 }}>
                {s.t}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {loading ? "Loading…" : s.d}
              </div>
            </div>
          ))}
        </>
      )}

      {data && !loading && (
        <>
          {/* Overview cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: "1.8rem" }}>
            {funds.map((f, i) => (
              <div key={f.ticker} style={{ ...CARD, flex: 1, minWidth: 180, borderTop: `3px solid ${COLORS[i]}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <CompanyLogo ticker={f.ticker} size={26} />
                  <Link href={`/etf?ticker=${f.ticker}`} style={{ fontFamily: MONO, fontWeight: 700, color: COLORS[i], textDecoration: "none" }}>{f.ticker}</Link>
                </div>
                <div style={{ fontSize: "0.78rem", fontWeight: 500, lineHeight: 1.3, marginBottom: 6 }}>{f.name}</div>
                <div style={{ fontFamily: MONO, fontSize: "1.2rem", fontWeight: 600 }}>{money(f.price)}</div>
                <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 4 }}>
                  {f.holdingsAvailable ? `${f.count} holdings · ${big(f.netAssets)}` : "holdings not published"}
                </div>
              </div>
            ))}
          </div>

          {/* Performance race */}
          {(perfData.length > 10 || chartMode === "tv") && (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.9rem" }}>
                <span>Performance</span>
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.62rem" }}>
                  % return, dividend-adjusted, over the shared window
                </span>
                <span style={{ marginLeft: "auto", alignSelf: "center", display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* TradingView ships its own timeframe controls */}
                  {chartMode === "builtin" && <RangeToggle range={range} onChange={setRange} />}
                  <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                </span>
              </div>
              <div style={{ ...CARD, padding: "18px 14px 8px", marginBottom: "1.8rem" }}>
                {chartMode === "tv" ? (
                  <CompareChart tickers={funds.map((f: any) => f.ticker)} />
                ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={perfData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                    <XAxis dataKey="date" tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false}
                      tickFormatter={(d: any) => String(d).slice(0, 7)} minTickGap={70} />
                    <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: MONO }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip
                      labelStyle={{ color: "var(--text-primary)" }} itemStyle={{ color: "var(--text-primary)" }}
                      contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 22, fontFamily: MONO, fontSize: 12 }}
                      formatter={(v: any, name: any) => [`${Number(v) >= 0 ? "+" : ""}${Number(v).toFixed(1)}%`, name]}
                    />
                    <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 13 }} />
                    {funds.map((f, i) => (
                      <Line key={f.ticker} type="monotone" dataKey={f.ticker} stroke={COLORS[i]} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </>
          )}

          {/* Overlap matrix — the headline feature */}
          {withHoldings.length >= 2 && (
            <>
              <div style={{ fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.9rem" }}>
                Holdings Overlap
                <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.62rem", marginLeft: 10 }}>
                  share of net assets held in common
                </span>
              </div>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginBottom: "0.8rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.82rem" }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "10px 14px" }} />
                      {withHoldings.map((f) => (
                        <th key={f.ticker} style={{ padding: "10px 14px", textAlign: "center", color: "var(--accent-gold)", fontWeight: 700 }}>{f.ticker}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {withHoldings.map((fa) => (
                      <tr key={fa.ticker} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "10px 14px", color: "var(--accent-gold)", fontWeight: 700 }}>{fa.ticker}</td>
                        {withHoldings.map((fb) => {
                          if (fa.ticker === fb.ticker)
                            return <td key={fb.ticker} style={{ padding: "10px 14px", textAlign: "center", color: "var(--text-muted)" }}>—</td>;
                          const p = ov(fa.ticker, fb.ticker);
                          return (
                            <td key={fb.ticker} style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: p != null ? overlapColor(p) : "var(--text-muted)" }}>
                              {p != null ? `${p.toFixed(0)}%` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginBottom: "1.8rem", lineHeight: 1.6 }}>
                <span style={{ color: "var(--positive)", fontWeight: 600 }}>Green</span> = mostly independent baskets ·{" "}
                <span style={{ color: "var(--accent-gold)", fontWeight: 600 }}>gold</span> = partial ·{" "}
                <span style={{ color: "var(--negative)", fontWeight: 600 }}>red</span> = largely the same fund. Computed as the
                sum of the smaller weight for every security both funds hold.
              </div>
            </>
          )}

          {/* Side-by-side metrics */}
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.8rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  <th style={{ textAlign: "left", padding: "9px 14px", fontFamily: SANS, fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", minWidth: 150 }}>Metric</th>
                  {funds.map((f, i) => (
                    <th key={f.ticker} style={{ textAlign: "right", padding: "9px 14px", color: COLORS[i], fontWeight: 700 }}>{f.ticker}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, ri) => (
                  <tr key={row.label} style={{ background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)", borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 14px", fontFamily: SANS, fontSize: "0.75rem", color: "var(--text-secondary)" }}>{row.label}</td>
                    {funds.map((f) => (
                      <td key={f.ticker} style={{ padding: "8px 14px", textAlign: "right", color: f.holdingsAvailable || /Price|Yield|Return/.test(row.label) ? (row.color?.(f) ?? "var(--text-primary)") : "var(--text-muted)" }}>
                        {row.get(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "1.2rem", lineHeight: 1.6 }}>
            Holdings and concentration from SEC N-PORT filings (as-of each fund&apos;s report date); price, yield and
            returns from marketstack. Effective holdings = 1 / Σ(weight²), the number of equally-weighted names the
            fund behaves like.
          </div>
        </>
      )}
    </div>
  );
}

export default function EtfComparePage() {
  return <Suspense fallback={null}><CompareInner /></Suspense>;
}
