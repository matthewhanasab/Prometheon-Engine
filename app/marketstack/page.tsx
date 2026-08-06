"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CompanyLogo from "@/components/CompanyLogo";
import TradingViewChart from "@/components/TradingViewChart";
import PriceChart from "@/components/PriceChart";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";
import ShareCardButton from "@/components/ShareCardButton";
import MsNav from "@/components/MsNav";

// Stock Research, rebuilt on marketstack data end-to-end. Same visual language
// as /research, but every number here comes from the marketstack Business plan
// (plus TradingView's own widget for the interactive chart).

const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

const PICKS = ["AAPL", "NVDA", "MSFT", "KO", "SPY", "IREN"];

/** Inline area chart — keeps the intraday panel dependency-free. */
function Sparkline({ series, up }: { series: { d: string; c: number }[]; up: boolean }) {
  if (series.length < 2) return null;
  const W = 1000, H = 200, PAD = 4;
  const vals = series.map((p) => p.c);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * W;
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);
  const line = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.c).toFixed(1)}`).join(" ");
  const stroke = up ? "var(--positive)" : "var(--negative)";
  const gid = up ? "msIntraUp" : "msIntraDown";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 200, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "N/A" : `$${fmt(n)}`);
const pct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
const compact = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "N/A"
    : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

function MCard({ label, value, sub, tone = "default", na = false }: {
  label: string; value?: string; sub?: string; tone?: "good" | "bad" | "neutral" | "default"; na?: boolean;
}) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "14px 16px", opacity: na ? 0.6 : 1 }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>{label}</div>
      {na ? (
        <div style={{ fontFamily: SANS, fontSize: "0.72rem", fontWeight: 600, color: "var(--accent-gold)", lineHeight: 1.35 }}>
          Not available on Market Stack
        </div>
      ) : (
        <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      )}
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** Whole-section placeholder, so the layout still mirrors /research. */
function NASection({ reason }: { reason: string }) {
  return (
    <div style={{ ...CARD, padding: "18px 20px", opacity: 0.6, borderStyle: "dashed" }}>
      <div style={{ fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 4 }}>
        Not available on Market Stack
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{reason}</div>
    </div>
  );
}

function Grid({ cols = 5, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(150px, 44vw), 1fr))`, gap: 10 }}>
      {children}
    </div>
  );
}

const pctOf = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${(n * 100).toFixed(d)}%`;
const mult = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${n.toFixed(2)}×`;

type Tone = "good" | "bad" | "neutral" | "default";
const peTone = (pe: number | null): [string, Tone] =>
  pe == null ? ["No data", "default"] : pe < 15 ? ["Value territory", "good"]
    : pe < 25 ? ["Reasonable multiple", "neutral"] : ["Growth premium priced in", "bad"];
const marginTone = (m: number | null, kind: "gross" | "operating" | "net"): [string, Tone] => {
  if (m == null) return ["No data", "default"];
  const hi = kind === "gross" ? 0.4 : kind === "operating" ? 0.2 : 0.15;
  const lo = kind === "gross" ? 0.2 : kind === "operating" ? 0.08 : 0.05;
  return m > hi ? [kind === "gross" ? "Solid gross margin" : kind === "operating" ? "Strong operating leverage" : "Highly profitable", "good"]
    : m > lo ? ["Moderate margin", "neutral"] : ["Thin margin", "bad"];
};
const roeTone = (r: number | null): [string, Tone] =>
  r == null ? ["No data", "default"] : r > 0.2 ? ["Exceptional capital returns", "good"]
    : r > 0.1 ? ["Healthy returns", "neutral"] : r > 0 ? ["Low returns", "bad"] : ["Negative returns", "bad"];
const deTone = (d: number | null): [string, Tone] =>
  d == null ? ["No data", "default"] : d < 0.5 ? ["Conservative leverage", "good"]
    : d < 1.5 ? ["Moderate leverage", "neutral"] : ["High leverage", "bad"];

function ratingTone(r: string | null): string {
  if (!r) return "var(--text-secondary)";
  const s = r.toLowerCase();
  if (s.includes("buy") || s.includes("outperform") || s.includes("overweight")) return "var(--positive)";
  if (s.includes("sell") || s.includes("underperform") || s.includes("underweight")) return "var(--negative)";
  return "var(--accent-gold)";
}

function MarketstackResearchInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");
  const loadedOnce = useRef(false);

  async function load(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/marketstack-stock/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch"); setData(null);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    const t = search.get("ticker");
    if (t) load(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = data?.quote;
  const prof = data?.profile;
  const cons = data?.consensus;
  const div = data?.dividends;
  const fun = data?.fundamentals;
  const intra = data?.intraday;
  const capm = data?.capm;
  const priceSeries: { date: string; price: number }[] = data?.price ?? [];
  const chartWindow = sliceRange<{ date: string; price: number }>(priceSeries, range);
  // "Live" = the newest bar is within ~15 minutes of now. Off-hours the same
  // panel still renders, labelled as the last completed session.
  const marketLive = intra?.time
    ? Date.now() - Date.parse(intra.time.replace(" ", "T") + ":00Z") < 15 * 60_000
    : false;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Stock Research
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        The research page, rebuilt on <strong>marketstack</strong> data — 15-year history, live IEX quotes,
        analyst ratings, SEC filings, full dividend record.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Type a ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Analyze"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.2rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => load(t)}
            style={{
              background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)",
              color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)",
              border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px",
              fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer",
            }}>{t}</button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "30px 0" }}>Loading {input}…</div>}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {data && q && !loading && (
        <>
          {/* ── Company Header ── */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
              <CompanyLogo ticker={data.ticker} size={58} />
              <div style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 500 }}>{prof?.name ?? data.ticker}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[data.ticker, prof?.exchange, prof?.sector, prof?.industry].filter(Boolean).map((v: string) => (
                <span key={v} style={{ fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>{v}</span>
              ))}
              {data.meta?.cik && (
                <span style={{ fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", fontFamily: MONO }}>
                  CIK {Number(data.meta.cik)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)", marginRight: 2 }}>Peers</span>
              <span style={{ fontSize: "0.68rem", fontWeight: 600, color: "var(--accent-gold)", background: "var(--bg-elevated)", border: "1px dashed var(--border)", borderRadius: 999, padding: "3px 9px" }}>
                Not available on Market Stack
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>no screener endpoint to rank industry peers by market cap</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{money(q.price)}</span>
              <span style={{ fontFamily: MONO, fontSize: "1rem", fontWeight: 500, color: (q.change ?? 0) >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {(q.change ?? 0) >= 0 ? "▲" : "▼"} ${Math.abs(q.change ?? 0).toFixed(2)} ({pct(q.changePct)})
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>as of {q.date}</span>
              <span style={{ marginLeft: "auto", alignSelf: "center" }}>
                <ShareCardButton
                  stock={{
                    ticker: data.ticker,
                    name: prof?.name ?? data.ticker,
                    sector: prof?.sector ?? null,
                    price: q.price,
                    change: q.change,
                    changePct: q.changePct,
                    mktCap: fun?.marketCap ?? null,
                    week52High: q.week52High,
                    week52Low: q.week52Low,
                    peRatio: fun?.peRatio ?? null,
                    analystTarget: cons?.avgTarget ?? null,
                  }}
                  window={chartWindow}
                  rangeLabel={range}
                />
              </span>
            </div>
            {intra?.last != null && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontFamily: MONO, fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontFamily: SANS, fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em", alignSelf: "center" }}>
                  {marketLive ? "● Live · IEX" : "Last session · IEX"}
                </span>
                <span>last {money(intra.last)}</span>
                {intra.bid != null && <span>bid {money(intra.bid)}{intra.bidSize ? ` ×${intra.bidSize}` : ""}</span>}
                {intra.ask != null && <span>ask {money(intra.ask)}{intra.askSize ? ` ×${intra.askSize}` : ""}</span>}
                {intra.time && <span style={{ color: "var(--text-muted)" }}>{intra.time} UTC</span>}
              </div>
            )}
          </div>

          {/* ── Intraday (marketstack real-time IEX) ── */}
          {intra?.series?.length > 1 && (
            <>
              <SectionLabel right={
                <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                  {intra.bars} one-minute bars · {intra.sessionDate}
                </span>
              }>
                {marketLive ? "Intraday — Live" : "Intraday — Last Session"}
              </SectionLabel>
              <div style={{ ...CARD, padding: "16px 8px 10px" }}>
                <Sparkline
                  series={intra.series.map((x: any) => ({ d: x.t, c: x.p }))}
                  up={(intra.last ?? 0) >= (intra.sessionOpen ?? 0)}
                />
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 14px 0", fontFamily: MONO, fontSize: "0.66rem", color: "var(--text-muted)" }}>
                  <span>{intra.series[0]?.t}</span>
                  <span style={{ color: (intra.last ?? 0) >= (intra.sessionOpen ?? 0) ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                    {intra.sessionOpen ? pct(((intra.last - intra.sessionOpen) / intra.sessionOpen) * 100) : ""} on session
                  </span>
                  <span>{intra.series[intra.series.length - 1]?.t} UTC</span>
                </div>
              </div>
              <div style={{ height: 10 }} />
              <Grid cols={5}>
                <MCard label="Last Trade" value={money(intra.last)} sub={marketLive ? "live" : "session close"} />
                <MCard label="Session Open" value={money(intra.sessionOpen)} />
                <MCard label="Session High" value={money(intra.sessionHigh)} tone="good" />
                <MCard label="Session Low" value={money(intra.sessionLow)} tone="bad" />
                <MCard label="Session Volume" value={compact(intra.volume)} />
              </Grid>
            </>
          )}

          {/* ── Price Chart ── */}
          <SectionLabel right={
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* TradingView ships its own timeframe controls */}
              {chartMode === "builtin" && <RangeToggle range={range} onChange={setRange} />}
              <ChartModeToggle mode={chartMode} onChange={setChartMode} />
            </div>
          }>Price Chart</SectionLabel>
          {chartMode === "builtin"
            ? <PriceChart data={chartWindow} label={range} />
            : <TradingViewChart ticker={data.ticker} />}

          {/* ── Quick Stats ── */}
          <SectionLabel>Quick Stats</SectionLabel>
          <Grid cols={5}>
            <MCard label="52-Wk High" value={money(q.week52High)} />
            <MCard label="52-Wk Low" value={money(q.week52Low)} />
            <MCard label="52-Wk Position" value={q.pos52 != null ? `${q.pos52.toFixed(0)}%` : "N/A"}
              sub={q.pos52 != null ? (q.pos52 > 70 ? "Near 52-wk high" : q.pos52 < 30 ? "Near 52-wk low" : "Mid-range") : undefined} />
            <MCard label="Beta" value={capm?.beta != null ? capm.beta.toFixed(2) : "N/A"}
              sub={capm?.beta == null ? "Insufficient overlap" : capm.beta > 1.3 ? "High volatility" : capm.beta < 0.8 ? "Low volatility" : "Market-like beta"} />
            <MCard label="Analyst Target" value={cons?.avgTarget != null ? money(cons.avgTarget) : "N/A"}
              sub={cons?.avgTarget != null && q.price ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} upside` : undefined}
              tone={cons?.avgTarget != null && cons.avgTarget > q.price ? "good" : "default"} />
          </Grid>

          {/* ── Long-Term Performance ── */}
          <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>the 15-year history entitlement, live</span>}>
            Long-Term Performance
          </SectionLabel>
          <Grid cols={5}>
            {data.longReturns?.map((r: any) =>
              r.available ? (
                <MCard key={r.years} label={`${r.years}-Year Return`} value={pct(r.totalPct, 0)}
                  sub={`${pct(r.cagrPct, 1)}/yr · from ${money(r.fromPrice)} (${String(r.fromDate).slice(0, 4)})`}
                  tone={r.totalPct >= 0 ? "good" : "bad"} />
              ) : (
                <MCard key={r.years} label={`${r.years}-Year Return`} value="—" sub="not listed that long" />
              )
            )}
          </Grid>

          {/* ── Mandatory Metrics (SEC EDGAR XBRL) ── */}
          {fun && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>SEC EDGAR · TTM through {fun.asOf}</span>}>
                Mandatory Metrics
              </SectionLabel>
              <Grid cols={5}>
                {(() => { const [sub, tn] = peTone(fun.peRatio); return <MCard label="TTM P/E Ratio" value={mult(fun.peRatio)} sub={sub} tone={tn} />; })()}
                <MCard label="Forward P/E" na sub="Needs analyst EPS estimates" />
                <MCard label="Fwd EPS Growth" na sub="Needs analyst EPS estimates" />
                <MCard label="Revenue Growth" value={pctOf(fun.revenueGrowth, 1)}
                  sub={fun.revenueGrowth == null ? "No data" : fun.revenueGrowth > 0.1 ? "Rapid growth" : fun.revenueGrowth > 0 ? "Modest growth" : "Revenue declining"}
                  tone={fun.revenueGrowth == null ? "default" : fun.revenueGrowth > 0.1 ? "good" : fun.revenueGrowth > 0 ? "neutral" : "bad"} />
                <MCard label="Total Revenue" value={compact(fun.revenue)} sub="Trailing twelve months" />
              </Grid>
              <div style={{ height: 8 }} />
              <Grid cols={5}>
                {(() => { const [sub, tn] = marginTone(fun.grossMargin, "gross"); return <MCard label="Gross Margin" value={pctOf(fun.grossMargin)} sub={sub} tone={tn} />; })()}
                {(() => { const [sub, tn] = marginTone(fun.operatingMargin, "operating"); return <MCard label="Operating Margin" value={pctOf(fun.operatingMargin)} sub={sub} tone={tn} />; })()}
                {(() => { const [sub, tn] = marginTone(fun.netMargin, "net"); return <MCard label="Net Margin" value={pctOf(fun.netMargin)} sub={sub} tone={tn} />; })()}
                <MCard label="Price / Sales" value={mult(fun.ps)}
                  sub={fun.ps == null ? "No data" : fun.ps < 3 ? "Cheap vs revenue" : fun.ps < 8 ? "Fair P/S" : "Rich valuation"}
                  tone={fun.ps == null ? "default" : fun.ps < 3 ? "good" : fun.ps < 8 ? "neutral" : "bad"} />
                <MCard label="EPS (TTM)" value={fun.eps != null ? money(fun.eps) : "N/A"}
                  sub={fun.epsGrowth != null ? `${pctOf(fun.epsGrowth, 1)} YoY` : undefined} />
              </Grid>

              {/* ── Advanced Metrics ── */}
              <SectionLabel>Advanced Metrics</SectionLabel>
              <Grid cols={5}>
                <MCard label="PEG Ratio" value={mult(fun.pegRatio)}
                  sub={fun.pegRatio == null ? "Needs positive EPS growth" : fun.pegRatio < 1 ? "Growth at a discount" : fun.pegRatio < 2 ? "Fairly priced" : "Expensive vs growth"}
                  tone={fun.pegRatio == null ? "default" : fun.pegRatio < 1 ? "good" : fun.pegRatio < 2 ? "neutral" : "bad"} />
                {(() => { const [sub, tn] = roeTone(fun.roe); return <MCard label="Return on Equity" value={pctOf(fun.roe)} sub={sub} tone={tn} />; })()}
                <MCard label="Price / Book" value={mult(fun.pb)}
                  sub={fun.pb == null ? "No data" : fun.pb < 3 ? "Near book value" : "Premium to book"}
                  tone={fun.pb == null ? "default" : fun.pb < 3 ? "good" : "bad"} />
                <MCard label="Price / FCF" value={mult(fun.pfcf)}
                  sub={fun.pfcf == null ? "No data" : fun.pfcf < 20 ? "Cheap on cash flow" : "Expensive on FCF"}
                  tone={fun.pfcf == null ? "default" : fun.pfcf < 20 ? "good" : "bad"} />
                <MCard label="FCF Yield" value={pctOf(fun.fcfYield, 1)}
                  sub={fun.fcf != null ? `${compact(fun.fcf)} free cash flow` : undefined}
                  tone={fun.fcfYield == null ? "default" : fun.fcfYield > 0.05 ? "good" : "neutral"} />
              </Grid>
              <div style={{ height: 8 }} />
              <Grid cols={5}>
                <MCard label="Dividend Yield" value={div?.yieldPct != null ? `${div.yieldPct.toFixed(2)}%` : "N/A"}
                  sub={div?.yieldPct == null ? "No dividend" : div.yieldPct > 3 ? "High yield" : div.yieldPct > 1 ? "Moderate yield" : "Token dividend"} />
                {(() => { const [sub, tn] = deTone(fun.debtToEquity); return <MCard label="Debt / Equity" value={mult(fun.debtToEquity)} sub={sub} tone={tn} />; })()}
                <MCard label="Current Ratio" value={mult(fun.currentRatio)}
                  sub={fun.currentRatio == null ? "No data" : fun.currentRatio > 1.5 ? "Strong liquidity" : fun.currentRatio >= 1 ? "Adequate liquidity" : "Tight liquidity"}
                  tone={fun.currentRatio == null ? "default" : fun.currentRatio > 1.5 ? "good" : fun.currentRatio >= 1 ? "neutral" : "bad"} />
                <MCard label="Net Debt / Cash"
                  value={fun.netDebt == null ? "N/A" : `${compact(Math.abs(fun.netDebt))} ${fun.netDebt >= 0 ? "net debt" : "net cash"}`}
                  sub={fun.longTermInvestments ? `excl. ${compact(fun.longTermInvestments)} LT securities` : `${compact(fun.cash)} cash + ST inv.`}
                  tone={fun.netDebt == null ? "default" : fun.netDebt < 0 ? "good" : "neutral"} />
                <MCard label="Operating CF" value={compact(fun.ocf)}
                  sub={fun.capex != null ? `less ${compact(fun.capex)} capex` : undefined}
                  tone={fun.ocf != null && fun.ocf > 0 ? "good" : "default"} />
              </Grid>

              {/* ── Quality & Fair Value ── */}
              <SectionLabel>Quality &amp; Fair Value</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 92vw), 1fr))", gap: 10 }}>
                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>Piotroski F-Score</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: fun.piotroski.score >= 7 ? "var(--positive)" : fun.piotroski.score >= 4 ? "var(--accent-gold)" : "var(--negative)" }}>
                    {fun.piotroski.score} / {fun.piotroski.outOf}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 10 }}>{fun.piotroski.basis}</div>
                  <div style={{ display: "grid", gap: 3 }}>
                    {fun.piotroski.checks.map((c: any, i: number) => (
                      <div key={i} style={{ display: "flex", gap: 8, fontSize: "0.68rem", alignItems: "baseline" }}>
                        <span style={{ width: 12, color: c.pass === true ? "var(--positive)" : c.pass === false ? "var(--negative)" : "var(--text-muted)", fontWeight: 700 }}>
                          {c.pass === true ? "✓" : c.pass === false ? "✗" : "–"}
                        </span>
                        <span style={{ color: c.pass === false ? "var(--text-secondary)" : "var(--text-primary)" }}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>Altman Z-Score</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: (fun.altmanZ ?? 0) > 2.99 ? "var(--positive)" : (fun.altmanZ ?? 0) > 1.81 ? "var(--accent-gold)" : "var(--negative)" }}>
                    {fun.altmanZ != null ? fun.altmanZ.toFixed(2) : "N/A"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: 6 }}>
                    {fun.altmanZ == null ? "Insufficient data"
                      : fun.altmanZ > 2.99 ? "Safe zone — low bankruptcy risk"
                      : fun.altmanZ > 1.81 ? "Grey zone — some financial stress"
                      : "Distress zone — elevated risk"}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                    Weighted from working capital, retained earnings, operating income, market cap and revenue, all against total assets.
                  </div>
                </div>

                <div style={{ ...CARD, padding: "16px 18px" }}>
                  <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>DCF Fair Value</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.6rem", fontWeight: 700, color: fun.dcf && fun.dcf.perShare > q.price ? "var(--positive)" : "var(--negative)" }}>
                    {fun.dcf ? money(fun.dcf.perShare) : "N/A"}
                  </div>
                  {fun.dcf && (
                    <>
                      <div style={{ fontSize: "0.7rem", color: fun.dcf.perShare > q.price ? "var(--positive)" : "var(--negative)", marginTop: 6 }}>
                        {pct(((fun.dcf.perShare - q.price) / q.price) * 100, 1)} vs price
                      </div>
                      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
                        Two-stage FCF model: {pctOf(fun.dcf.assumedGrowth, 1)} growth for 5y then half that,
                        {" "}{pctOf(fun.dcf.discount, 0)} discount, {pctOf(fun.dcf.terminal, 1)} terminal.
                        Assumption-driven — a reference point, not a target.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CAPM ── */}
          {capm && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>
                beta from {capm.betaSamples} monthly returns vs SPY (5-year)
              </span>}>
                CAPM · Risk-Adjusted Return
              </SectionLabel>
              <Grid cols={5}>
                <MCard label="Risk-Free Rate (10Y)" value={`${(capm.rf * 100).toFixed(2)}%`} sub="FRED DGS10 · daily" />
                <MCard label="Beta (vs Market)" value={capm.beta != null ? capm.beta.toFixed(2) : "N/A"}
                  sub={capm.beta == null ? "Insufficient overlap" : capm.beta > 1 ? "More volatile than market" : "Less volatile than market"} />
                <MCard label="Equity Risk Premium" value={`${(capm.erp * 100).toFixed(2)}%`} sub={`Mkt 10% − Rf ${(capm.rf * 100).toFixed(2)}%`} />
                <MCard label="CAPM Expected Return" value={capm.expected != null ? `${(capm.expected * 100).toFixed(2)}%` : "N/A"} sub="Rf + β × ERP" tone="neutral" />
                <MCard label="Actual 1Y Return" value={capm.actual1Y != null ? pct(capm.actual1Y, 1) : "N/A"}
                  tone={capm.actual1Y == null ? "default" : capm.actual1Y >= 0 ? "good" : "bad"} />
              </Grid>
              {capm.expected != null && capm.actual1Y != null && (
                <>
                  <div style={{ height: 8 }} />
                  <Grid cols={5}>
                    <MCard label="Jensen's Alpha (1Y)"
                      value={pct(capm.actual1Y - capm.expected * 100, 2)}
                      sub={capm.actual1Y / 100 > capm.expected ? "Outperformed CAPM" : "Underperformed CAPM"}
                      tone={capm.actual1Y / 100 > capm.expected ? "good" : "bad"} />
                  </Grid>
                </>
              )}
            </>
          )}

          {/* ── Earnings History ── */}
          <SectionLabel>Earnings History</SectionLabel>
          <NASection reason="Marketstack has no earnings-surprise endpoint (reported vs estimate). Reported EPS is available from SEC filings, but the estimate side — which is what makes a surprise — is not." />

          {/* ── Analyst Ratings ── */}
          {cons && (
            <>
              <SectionLabel right={cons.asOf ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>as of {cons.asOf}</span> : undefined}>
                Analyst Ratings — {cons.analysts ?? "?"} Analysts
              </SectionLabel>
              <Grid cols={5}>
                <MCard label="Avg Target" value={money(cons.avgTarget)}
                  sub={q.price && cons.avgTarget != null ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} implied` : undefined}
                  tone={cons.avgTarget != null && cons.avgTarget > q.price ? "good" : "bad"} />
                <MCard label="High Target" value={money(cons.highTarget)} tone="good" />
                <MCard label="Low Target" value={money(cons.lowTarget)} tone="bad" />
                <MCard label="Buy / Hold / Sell" value={`${cons.buy} / ${cons.hold} / ${cons.sell}`} />
                <MCard label="Consensus" value={
                  cons.buy + cons.hold + cons.sell > 0
                    ? cons.buy / (cons.buy + cons.hold + cons.sell) > 0.6 ? "Buy" : cons.sell > cons.buy ? "Sell" : "Hold"
                    : "N/A"
                } tone={cons.buy > cons.hold + cons.sell ? "good" : "neutral"} />
              </Grid>

              {/* buy/hold/sell bar */}
              {cons.buy + cons.hold + cons.sell > 0 && (
                <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginTop: 10, border: "1px solid var(--border)" }}>
                  <div style={{ width: `${(cons.buy / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--positive)" }} />
                  <div style={{ width: `${(cons.hold / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--accent-gold)" }} />
                  <div style={{ width: `${(cons.sell / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--negative)" }} />
                </div>
              )}

              {data.analysts?.length > 0 && (
                <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 380, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Analyst</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Firm</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Rating</th>
                        <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Target</th>
                        <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.analysts.map((a: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "7px 14px", fontWeight: 600 }}>{a.name}</td>
                          <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{a.firm}</td>
                          <td style={{ padding: "7px 10px", color: ratingTone(a.rating), fontWeight: 600 }}>
                            {a.rating ?? "—"}{a.action ? <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.66rem" }}> · {a.action}</span> : null}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO }}>{a.target != null ? money(a.target) : "—"}</td>
                          <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{a.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Consensus Estimates ── */}
          <SectionLabel>Consensus Estimates — EPS &amp; Revenue</SectionLabel>
          <NASection reason="Marketstack's companyratings endpoint returns price targets and buy/hold/sell ratings, but no forward EPS or revenue estimates. This is the same gap that blocks Forward P/E and Fwd EPS Growth above." />

          {/* ── Ownership Breakdown ── */}
          <SectionLabel>Ownership Breakdown</SectionLabel>
          <NASection reason="No institutional/insider ownership endpoint. This is buildable from SEC EDGAR 13F and Form 4 filings (free, public domain) but needs a parsing layer — it isn't a marketstack feature." />

          {/* ── ETF Ownership ── */}
          <SectionLabel>ETF Ownership</SectionLabel>
          <NASection reason="The etfholdings endpoint is listed on the Business plan but returns &quot;No data is available for this ticker at the moment&quot; — tested against SPY and QQQ. Worth raising with their support." />

          {/* ── Earnings Call Transcripts ── */}
          <SectionLabel>Earnings Call Transcripts</SectionLabel>
          <NASection reason="Marketstack does not offer transcripts at any tier." />

          {/* ── Insider Activity ── */}
          <SectionLabel>Insider Activity — Form 4</SectionLabel>
          <NASection reason="Form 4 filings are listed in the SEC Filings section below (via the submissions endpoint), but marketstack provides no parsed insider transactions — no buy/sell direction, share counts, or values." />

          {/* ── Institutional Holders ── */}
          <SectionLabel>Institutional Holders</SectionLabel>
          <NASection reason="No 13F holdings endpoint. Same as Ownership Breakdown: available free from SEC EDGAR, but requires building the parser." />

          {/* ── Dividends ── */}
          <SectionLabel right={div?.count ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>{div.count} records since {div.oldest}</span> : undefined}>
            Dividends
          </SectionLabel>
          {div?.count > 0 ? (
            <>
              <Grid cols={5}>
                <MCard label="TTM Dividends" value={money(div.ttmTotal)} />
                <MCard label="Yield" value={div.yieldPct != null ? `${div.yieldPct.toFixed(2)}%` : "N/A"} tone="good" />
                <MCard label="Frequency" value={div.freq === "q" ? "Quarterly" : div.freq === "m" ? "Monthly" : div.freq === "s" ? "Semi-Annual" : div.freq ?? "N/A"} />
                {div.upcoming?.length > 0
                  ? <MCard label="Next Ex-Date" value={div.upcoming[0].date} sub={`${money(div.upcoming[0].amount)}${div.upcoming[0].paymentDate ? ` · pays ${div.upcoming[0].paymentDate}` : ""}`} tone="good" />
                  : <MCard label="Next Ex-Date" value="Not declared" />}
                <MCard label="History Depth" value={String(div.count)} sub={`back to ${String(div.oldest).slice(0, 4)}`} />
              </Grid>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.recent.map((d: any) => (
                      <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 14px", color: "var(--text-secondary)" }}>{d.date}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{money(d.amount)}</td>
                        <td style={{ padding: "6px 14px", textAlign: "right", color: "var(--text-muted)" }}>{d.paymentDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ ...CARD, padding: "14px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>No dividends on record.</div>
          )}

          {/* ── SEC Filings ── */}
          {data.filings?.length > 0 && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>via marketstack EDGAR submissions</span>}>
                SEC Filings
              </SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Form</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Description</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Filed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.filings.map((f: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 14px", fontFamily: MONO, fontWeight: 600, color: "var(--accent-gold)" }}>
                          {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{f.form}</a> : f.form}
                        </td>
                        <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{f.description}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{f.filed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Splits ── */}
          {data.splits?.length > 0 && (
            <>
              <SectionLabel>Split History</SectionLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.splits.map((s: any) => (
                  <span key={s.date} style={{ ...CARD, borderRadius: 999, padding: "6px 14px", fontFamily: MONO, fontSize: "0.74rem" }}>
                    <span style={{ fontWeight: 700 }}>{s.factor}:1</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{s.date}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── About / Profile ── */}
          {prof?.about && (
            <>
              <SectionLabel>About</SectionLabel>
              <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.82rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
                {prof.about}
                <div style={{ marginTop: 12, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.9 }}>
                  {prof.employees != null && <div>👥 {Number(prof.employees).toLocaleString()} employees</div>}
                  {prof.address && <div>🏢 {prof.address}</div>}
                  {prof.website && <div>🔗 <a href={prof.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{prof.website}</a></div>}
                </div>
              </div>
            </>
          )}

          {/* ── Executives ── */}
          {prof?.executives?.length > 0 && (
            <>
              <SectionLabel>Key Executives</SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <tbody>
                    {prof.executives.map((e: any, i: number) => (
                      <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: "8px 16px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{e.role ?? "—"}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>
                          {e.salary ? `$${Number(e.salary).toLocaleString()}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Recent News ── */}
          <SectionLabel>Recent News</SectionLabel>
          <NASection reason="Marketstack has no news endpoint. The research page uses Finnhub for this — a separate provider." />

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "2rem", lineHeight: 1.6 }}>
            Prices, quotes, ratings, dividends, splits and filings from marketstack (Business plan); chart by
            TradingView. Fundamentals come from SEC EDGAR XBRL — marketstack&apos;s Statements/Facts/Concepts
            endpoints are on the pricing page but return &quot;route not found&quot;, and ETF holdings returns no data.
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketstackResearchPage() {
  return <Suspense fallback={null}><MarketstackResearchInner /></Suspense>;
}
