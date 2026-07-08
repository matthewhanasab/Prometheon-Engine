"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TradingViewChart from "@/components/TradingViewChart";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}
function fmtLarge(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
function fmtPct(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  return `${(n * 100).toFixed(2)}%`;
}
function fmtX(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  return `${n.toFixed(2)}×`;
}
function pctColor(n: number | null | undefined) {
  if (n == null) return "var(--text-secondary)";
  return n >= 0 ? "var(--positive)" : "var(--negative)";
}

// ── Tone helpers (good/bad/neutral) ──────────────────────────────────────────
function peTone(pe: number | null): [string, "good"|"bad"|"neutral"|"default"] {
  if (pe == null) return ["No data", "default"];
  if (pe < 0)     return ["Negative earnings", "bad"];
  if (pe < 15)    return ["Attractively valued", "good"];
  if (pe < 25)    return ["Fairly valued", "neutral"];
  if (pe < 40)    return ["Growth premium priced in", "neutral"];
  return ["Very high valuation", "bad"];
}
function marginTone(m: number | null, type: string): [string, "good"|"bad"|"neutral"|"default"] {
  if (m == null) return ["No data", "default"];
  const pct = m * 100;
  if (type === "gross")     return pct > 50 ? ["Excellent gross margin","good"] : pct > 30 ? ["Solid gross margin","neutral"] : ["Thin gross margin","bad"];
  if (type === "operating") return pct > 20 ? ["Strong operating leverage","good"] : pct > 10 ? ["Decent margins","neutral"] : ["Thin operating margin","bad"];
  return pct > 20 ? ["Highly profitable","good"] : pct > 8 ? ["Profitable","neutral"] : ["Thin net margin","bad"];
}
function roeTone(roe: number | null): [string, "good"|"bad"|"neutral"|"default"] {
  if (roe == null) return ["No data", "default"];
  const p = roe * 100;
  if (p > 20) return ["Exceptional capital returns","good"];
  if (p > 10) return ["Above-average ROE","neutral"];
  return ["Below-average ROE","bad"];
}
function deTone(de: number | null): [string, "good"|"bad"|"neutral"|"default"] {
  if (de == null) return ["No data","default"];
  if (de < 0.3) return ["Low leverage","good"];
  if (de < 1.0) return ["Moderate leverage","neutral"];
  return ["High leverage","bad"];
}
function divTone(dy: number | null): [string, "good"|"bad"|"neutral"|"default"] {
  if (!dy || dy <= 0) return ["No dividend","default"];
  const p = dy * 100;
  if (p > 4) return ["High yield — check sustainability","neutral"];
  if (p > 1) return ["Healthy dividend","good"];
  return ["Token dividend","neutral"];
}

// ── UI components ─────────────────────────────────────────────────────────────
function AboutSection({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <SectionLabel>About</SectionLabel>
      <div style={{ maxWidth: 760 }}>
        <p style={{
          fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.82rem",
          color: "var(--text-secondary)", lineHeight: 1.7, margin: "0 0 0.4rem",
          display: "-webkit-box", WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? "unset" : 2,
          overflow: expanded ? "visible" : "hidden",
        }}>{description}</p>
        <button onClick={() => setExpanded(e => !e)} style={{
          background: "none", border: "none", padding: 0,
          color: "var(--accent-gold)", fontSize: "0.75rem",
          fontFamily: "'IBM Plex Sans', sans-serif", cursor: "pointer",
          fontWeight: 500,
        }}>{expanded ? "Show less" : "Show more"}</button>
      </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
      marginBottom: "1rem", marginTop: "2rem",
    }}>{children}</div>
  );
}

function MCard({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string;
  tone?: "good"|"bad"|"neutral"|"default";
}) {
  const top = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "neutral" ? "var(--accent-gold)" : "var(--border)";
  const subColor = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "neutral" ? "var(--accent-gold)" : "var(--text-secondary)";
  return (
    <div style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderTop:`2px solid ${top}`, borderRadius:4, padding:"16px 14px 12px" }}>
      <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.58rem", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.12em", color:"var(--text-secondary)", marginBottom:8 }}>{label}</div>
      <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"1.25rem", fontWeight:600, color:"var(--text-primary)", lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.65rem", color: subColor, marginTop:6 }}>{sub}</div>}
    </div>
  );
}

function Grid({ cols = 5, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols}, 1fr)`, gap:10, marginBottom:"0.5rem" }}>
      {children}
    </div>
  );
}

// ── Empty preview (shown before a ticker is loaded) ──────────────────────────
function EmptyPreview() {
  const D = "—";
  const hint: React.CSSProperties = {
    fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.78rem",
    color: "var(--text-muted)", padding: "14px 0 4px",
  };
  return (
    <div>
      {/* Company header placeholder */}
      <div style={{ borderBottom:"1px solid var(--border)", paddingBottom:"1.5rem", marginBottom:"1.5rem" }}>
        <div style={{ fontFamily:"'IBM Plex Serif', Georgia, serif", fontSize:"2rem", fontWeight:500, color:"var(--text-muted)", marginBottom:10 }}>Company Name</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {["Ticker","Exchange","Sector","Industry"].map(v => (
            <span key={v} style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.60rem", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--text-muted)", background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:2, padding:"2px 8px" }}>{v}</span>
          ))}
        </div>
        <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"2.4rem", fontWeight:600, color:"var(--text-muted)", letterSpacing:"-0.02em" }}>$—.——</span>
      </div>

      <Grid cols={5}>
        <MCard label="52-Wk High" value={D} />
        <MCard label="52-Wk Low" value={D} />
        <MCard label="52-Wk Position" value={D} />
        <MCard label="Beta" value={D} />
        <MCard label="Analyst Target" value={D} />
      </Grid>

      <SectionLabel>Price Chart</SectionLabel>
      <div style={{ height: 500, border: "1px dashed var(--border-active)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, background: "var(--bg-surface)" }}>
        <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1rem", color: "var(--text-secondary)" }}>Interactive price chart</div>
        <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Candles · volume · drawing tools · indicators</div>
      </div>

      <SectionLabel>Mandatory Metrics</SectionLabel>
      <Grid cols={5}>
        <MCard label="TTM P/E Ratio" value={D} />
        <MCard label="Forward P/E" value={D} />
        <MCard label="Fwd EPS Growth" value={D} />
        <MCard label="Revenue Growth" value={D} />
        <MCard label="Total Revenue" value={D} />
      </Grid>
      <div style={{ height:8 }} />
      <Grid cols={5}>
        <MCard label="Gross Margin" value={D} />
        <MCard label="Operating Margin" value={D} />
        <MCard label="Net Margin" value={D} />
        <MCard label="Price / Sales" value={D} />
        <MCard label="EPS (TTM)" value={D} />
      </Grid>

      <SectionLabel>Advanced Metrics</SectionLabel>
      <Grid cols={5}>
        <MCard label="PEG Ratio" value={D} />
        <MCard label="Return on Equity" value={D} />
        <MCard label="Price / Book" value={D} />
        <MCard label="Price / FCF" value={D} />
        <MCard label="FCF Yield" value={D} />
      </Grid>
      <div style={{ height:8 }} />
      <Grid cols={5}>
        <MCard label="Dividend Yield" value={D} />
        <MCard label="Debt / Equity" value={D} />
        <MCard label="Current Ratio" value={D} />
        <MCard label="Net Debt / Cash" value={D} />
        <MCard label="Operating CF" value={D} />
      </Grid>

      <SectionLabel>CAPM · Risk-Adjusted Return</SectionLabel>
      <Grid cols={5}>
        <MCard label="Risk-Free Rate (10Y)" value={D} />
        <MCard label="Beta (vs Market)" value={D} />
        <MCard label="Equity Risk Premium" value={D} />
        <MCard label="CAPM Expected Return" value={D} />
        <MCard label="Actual 1Y Return" value={D} />
      </Grid>

      <SectionLabel>Analyst Recommendations</SectionLabel>
      <div style={hint}>Buy / hold / sell consensus across analysts, updated monthly.</div>

      <SectionLabel>Earnings History</SectionLabel>
      <div style={hint}>EPS estimates vs. actuals for recent quarters — beats and misses.</div>

      <SectionLabel>Insider Activity — SEC Form 4</SectionLabel>
      <div style={hint}>Recent purchases and sales by executives and directors.</div>

      <SectionLabel>Institutional Holders</SectionLabel>
      <div style={hint}>Top 10 funds holding the stock and how their positions changed.</div>

      <SectionLabel>About</SectionLabel>
      <div style={hint}>Company profile and business summary.</div>

      <SectionLabel>Recent News</SectionLabel>
      <div style={hint}>Latest headlines from the past two weeks.</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
function ResearchInner() {
  const searchParams = useSearchParams();
  const [input, setInput]   = useState("");
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInput(t.toUpperCase()); load(t.toUpperCase()); }
  }, []);

  async function load(sym: string) {
    if (!sym.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/stock/${sym.trim().toUpperCase()}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("Could not load data. Check the ticker symbol and try again.");
    } finally { setLoading(false); }
  }

  const s        = data?.stock;
  const price    = data?.price    ?? [];
  const earnings = data?.earnings ?? [];
  const recs     = data?.recs;
  const news     = data?.news     ?? [];
  const insiders      = data?.insiders      ?? [];
  const institutional = data?.institutional ?? [];
  const rf            = data?.rf            ?? 0.043;
  const ret1Y    = data?.return1Y ?? null;

  // CAPM
  const RM = 0.10;
  const erp = RM - rf;
  const beta = s?.beta ?? null;
  const capmRet = beta != null ? rf + beta * erp : null;
  const alpha   = ret1Y != null && capmRet != null ? ret1Y / 100 - capmRet : null;

  // 52W position
  const pos52 = s?.week52High && s?.week52Low && s?.price && s.week52High > s.week52Low
    ? ((s.price - s.week52Low) / (s.week52High - s.week52Low)) * 100 : null;

  // Insider summary
  const insiderBuys  = insiders.filter((t: any) => t.type === "BUY").length;
  const insiderSells = insiders.filter((t: any) => t.type === "SELL").length;
  const netShares    = insiders.reduce((acc: number, t: any) =>
    acc + (t.type === "BUY" ? t.shares : t.type === "SELL" ? -t.shares : 0), 0);
  const totalInsiderVal = insiders.reduce((acc: number, t: any) => acc + (t.value ?? 0), 0);

  const now = new Date().getFullYear();
  const futureEsts = (s?.estimates ?? []).filter((e: any) =>
    e.date && parseInt(e.date.slice(0,4)) >= now
  ).slice(0, 5);

  return (
    <div style={{ paddingBottom: "4rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily:"'IBM Plex Serif', Georgia, serif", fontSize:"1.75rem", fontWeight:500, color:"var(--text-primary)", letterSpacing:"-0.02em", marginBottom:"0.4rem" }}>Stock Research</h1>
      <div style={{ height:1, background:"linear-gradient(to right,var(--accent-gold),transparent)", opacity:0.4, maxWidth:200, marginBottom:"1.5rem" }} />
      <div style={{ fontSize:"0.82rem", color:"var(--text-secondary)", marginBottom:"1.5rem", fontFamily:"'IBM Plex Sans', sans-serif" }}>
        Type in a ticker below to get started — everything on this page fills in automatically.
      </div>

      {/* Search */}
      <form onSubmit={e => { e.preventDefault(); load(input); }} style={{ display:"flex", gap:10, marginBottom:"2rem", maxWidth:380 }}>
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
          style={{ flex:1, background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:4, padding:"10px 14px", color:"var(--text-primary)", fontFamily:"'IBM Plex Mono',monospace", fontSize:"0.85rem", outline:"none" }} />
        <button type="submit" style={{ background:"var(--accent-gold)", color:"#131C2E", border:"none", borderRadius:4, padding:"10px 22px", fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.72rem", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor:"pointer" }}>Analyze</button>
      </form>

      {loading && <div style={{ color:"var(--text-secondary)", fontSize:"0.85rem", padding:"40px 0" }}>Loading {input}…</div>}
      {error   && <div style={{ color:"var(--negative)", fontSize:"0.85rem" }}>{error}</div>}

      {!loading && !data && !error && <EmptyPreview />}

      {s && (
        <>
          {/* ── Company Header ── */}
          <div style={{ borderBottom:"1px solid var(--border)", paddingBottom:"1.5rem", marginBottom:"1.5rem" }}>
            <div style={{ fontFamily:"'IBM Plex Serif', Georgia, serif", fontSize:"2rem", fontWeight:500, color:"var(--text-primary)", marginBottom:10 }}>{s.name}</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
              {[s.ticker, s.exchange, s.sector, s.industry].filter(Boolean).map((v: string) => (
                <span key={v} style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.60rem", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--text-secondary)", background:"var(--bg-elevated)", border:"1px solid var(--border)", borderRadius:2, padding:"2px 8px" }}>{v}</span>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"baseline", gap:16, flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"2.4rem", fontWeight:600, color:"var(--text-primary)", letterSpacing:"-0.02em" }}>${fmt(s.price)}</span>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"1rem", fontWeight:500, color: pctColor(s.change) }}>
                {(s.change ?? 0) >= 0 ? "▲" : "▼"} ${Math.abs(s.change ?? 0).toFixed(2)} ({s.changePct != null ? `${s.changePct >= 0 ? "+" : ""}${s.changePct.toFixed(2)}%` : "N/A"})
              </span>
              <span style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.78rem", color:"var(--text-secondary)" }}>Mkt cap: {fmtLarge(s.mktCap)}</span>
            </div>
          </div>

          {/* ── Quick Stats ── */}
          <Grid cols={5}>
            <MCard label="52-Wk High" value={s.week52High ? `$${fmt(s.week52High)}` : "N/A"} />
            <MCard label="52-Wk Low"  value={s.week52Low  ? `$${fmt(s.week52Low)}`  : "N/A"} />
            <MCard label="52-Wk Position" value={pos52 != null ? `${pos52.toFixed(0)}%` : "N/A"}
              sub={pos52 != null ? (pos52 > 70 ? "Near 52-wk high" : pos52 < 30 ? "Near 52-wk low" : "Mid-range") : undefined} />
            <MCard label="Beta" value={beta != null ? fmt(beta) : "N/A"}
              sub={beta != null ? (beta > 1.3 ? "High volatility" : beta < 0.8 ? "Low volatility" : "Market-like beta") : undefined} />
            <MCard label="Analyst Target" value={s.analystTarget ? `$${fmt(s.analystTarget)}` : "N/A"}
              sub={s.analystTarget && s.price ? `${(((s.analystTarget - s.price) / s.price) * 100) >= 0 ? "+" : ""}${(((s.analystTarget - s.price) / s.price) * 100).toFixed(1)}% upside` : undefined}
              tone={s.analystTarget && s.price && s.analystTarget > s.price ? "good" : "default"} />
          </Grid>

          {/* ── TradingView Chart ── */}
          <SectionLabel>Price Chart</SectionLabel>
          <TradingViewChart ticker={s.ticker} />

          {/* ── Mandatory Metrics ── */}
          <SectionLabel>Mandatory Metrics</SectionLabel>
          <Grid cols={5}>
            {(() => { const [sub,t] = peTone(s.peRatio); return <MCard label="TTM P/E Ratio"    value={fmtX(s.peRatio)}   sub={sub} tone={t} />; })()}
            {(() => { const [sub,t] = peTone(s.fwdPE);   return <MCard label="Forward P/E"      value={fmtX(s.fwdPE)}    sub={sub} tone={t} />; })()}
            {(() => {
              const g = s.epsGrowth; const t = g == null ? "default" : g > 0.1 ? "good" : g > 0 ? "neutral" : "bad";
              return <MCard label="Fwd EPS Growth" value={g != null ? `${(g*100).toFixed(1)}%` : "N/A"} sub={g == null ? "No data" : g > 0.1 ? "Strong growth" : g > 0 ? "Moderate growth" : "Declining EPS"} tone={t} />;
            })()}
            {(() => {
              const g = s.revenueGrowth; const t = g == null ? "default" : g > 0.1 ? "good" : g > 0 ? "neutral" : "bad";
              return <MCard label="Revenue Growth" value={g != null ? `${(g*100).toFixed(1)}%` : "N/A"} sub={g == null ? "No data" : g > 0.1 ? "Rapid growth" : g > 0 ? "Modest growth" : "Revenue declining"} tone={t} />;
            })()}
            <MCard label="Total Revenue" value={fmtLarge(s.revenue)} sub="Annual run rate" />
          </Grid>
          <div style={{ height:8 }} />
          <Grid cols={5}>
            {(() => { const [sub,t] = marginTone(s.grossMargin,"gross");     return <MCard label="Gross Margin"    value={fmtPct(s.grossMargin)}  sub={sub} tone={t} />; })()}
            {(() => { const [sub,t] = marginTone(s.opMargin,"operating");    return <MCard label="Operating Margin" value={fmtPct(s.opMargin)}    sub={sub} tone={t} />; })()}
            {(() => { const [sub,t] = marginTone(s.netMargin,"net");         return <MCard label="Net Margin"      value={fmtPct(s.netMargin)}    sub={sub} tone={t} />; })()}
            {(() => { const t = !s.ps ? "default" : s.ps < 3 ? "good" : s.ps < 8 ? "neutral" : "bad"; return <MCard label="Price / Sales" value={fmtX(s.ps)} sub={!s.ps ? "No data" : s.ps < 3 ? "Cheap vs revenue" : s.ps < 8 ? "Fair P/S" : "Rich valuation"} tone={t} />; })()}
            <MCard label="EPS (TTM)" value={s.eps != null ? `$${fmt(s.eps)}` : "N/A"} sub={`Fwd: $${fmt(s.fwdEps)}`} />
          </Grid>

          {/* ── Advanced Metrics ── */}
          <SectionLabel>Advanced Metrics</SectionLabel>
          <Grid cols={5}>
            {(() => { const t = !s.peg ? "default" : s.peg < 1 ? "good" : s.peg < 2 ? "neutral" : "bad"; return <MCard label="PEG Ratio" value={fmtX(s.peg)} sub={!s.peg ? "No data" : s.peg < 1 ? "Undervalued vs growth" : s.peg < 2 ? "Fairly priced" : "Expensive vs growth"} tone={t} />; })()}
            {(() => { const [sub,t] = roeTone(s.roe); return <MCard label="Return on Equity" value={fmtPct(s.roe)} sub={sub} tone={t} />; })()}
            {(() => { const t = !s.pb ? "default" : s.pb < 1 ? "good" : s.pb < 4 ? "neutral" : "bad"; return <MCard label="Price / Book" value={fmtX(s.pb)} sub={!s.pb ? "No data" : s.pb < 1 ? "Below book value" : s.pb < 4 ? "Reasonable P/B" : "Premium to book"} tone={t} />; })()}
            {(() => { const t = !s.pFcf ? "default" : s.pFcf < 15 ? "good" : s.pFcf < 30 ? "neutral" : "bad"; return <MCard label="Price / FCF" value={fmtX(s.pFcf)} sub={!s.pFcf ? "No data" : s.pFcf < 15 ? "Cheap on FCF" : s.pFcf < 30 ? "Fair FCF multiple" : "Expensive on FCF"} tone={t} />; })()}
            {(() => {
              const y = s.fcfYield; const t: any = y == null ? "default" : y > 4 ? "good" : y > 1.5 ? "neutral" : "bad";
              return <MCard label="FCF Yield" value={y != null ? `${y.toFixed(1)}%` : "N/A"} sub={y == null ? "No FCF data" : y > 4 ? "Strong FCF generation" : y > 1.5 ? "Modest FCF yield" : "Low FCF yield"} tone={t} />;
            })()}
          </Grid>
          <div style={{ height:8 }} />
          <Grid cols={5}>
            {(() => { const [sub,t] = divTone(s.divYield); return <MCard label="Dividend Yield" value={s.divYield && s.divYield > 0 ? fmtPct(s.divYield) : "None"} sub={sub} tone={t} />; })()}
            {(() => { const [sub,t] = deTone(s.debtEquity); return <MCard label="Debt / Equity" value={s.debtEquity != null ? `${s.debtEquity.toFixed(2)}×` : "N/A"} sub={sub} tone={t} />; })()}
            {(() => { const cr = s.currentRatio; const t: any = cr == null ? "default" : cr > 1.5 ? "good" : cr > 1 ? "neutral" : "bad"; return <MCard label="Current Ratio" value={cr != null ? `${cr.toFixed(2)}×` : "N/A"} sub={cr == null ? "No data" : cr > 1.5 ? "Strong liquidity" : cr > 1 ? "Adequate liquidity" : "Liquidity risk"} tone={t} />; })()}
            {(() => {
              const nd = s.netDebt; const t: any = nd == null ? "default" : nd < 0 ? "good" : nd < (s.mktCap ?? 0) * 0.25 ? "neutral" : "bad";
              const label = nd == null ? "N/A" : nd < 0 ? `${fmtLarge(Math.abs(nd))} net cash` : `${fmtLarge(nd)} net debt`;
              return <MCard label="Net Debt / Cash" value={label} sub={nd == null ? "No data" : nd < 0 ? "Net cash position" : "Net debt position"} tone={t} />;
            })()}
            <MCard label="Operating CF" value={fmtLarge(s.operatingCF)}
              sub={s.operatingCF != null ? (s.operatingCF > 0 ? "Positive cash flow" : "Negative cash flow") : "No data"}
              tone={s.operatingCF != null ? (s.operatingCF > 0 ? "good" : "bad") : "default"} />
          </Grid>

          {/* ── CAPM ── */}
          {beta != null && (
            <>
              <SectionLabel>CAPM · Risk-Adjusted Return</SectionLabel>
              <Grid cols={5}>
                <MCard label="Risk-Free Rate (10Y)" value={`${(rf * 100).toFixed(2)}%`} sub="FRED DGS10 · daily" />
                <MCard label="Beta (vs Market)" value={fmt(beta)}
                  sub={beta > 1.5 ? "Amplifies market swings" : beta > 1.05 ? "Moves more than market" : beta < 0.8 ? "Dampens volatility" : "Tracks market closely"}
                  tone={beta > 1.5 ? "bad" : beta > 1.05 ? "neutral" : "good"} />
                <MCard label="Equity Risk Premium" value={`${(erp * 100).toFixed(2)}%`} sub={`Mkt 10% − Rf ${(rf*100).toFixed(2)}%`} />
                <MCard label="CAPM Expected Return" value={capmRet != null ? `${(capmRet*100).toFixed(2)}%` : "N/A"} sub="Rf + β × ERP" tone="neutral" />
                <MCard label="Actual 1Y Return" value={ret1Y != null ? `${ret1Y >= 0 ? "+" : ""}${ret1Y.toFixed(1)}%` : "N/A"}
                  sub={capmRet != null ? `CAPM benchmark: ${(capmRet*100).toFixed(1)}%` : undefined}
                  tone={ret1Y != null && capmRet != null ? (ret1Y/100 >= capmRet ? "good" : "bad") : "default"} />
              </Grid>
              {ret1Y != null && capmRet != null && (
                <div style={{ marginTop:12 }}>
                  <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
                    <div style={{ minWidth:160 }}>
                      <MCard label="Jensen's Alpha (1Y)"
                        value={alpha != null ? `${alpha! >= 0 ? "+" : ""}${(alpha! * 100).toFixed(2)}%` : "N/A"}
                        sub={alpha == null ? undefined : alpha > 0.01 ? "Outperforming risk-adjusted" : alpha < -0.01 ? "Underperforming" : "Matched expectation"}
                        tone={alpha == null ? "default" : alpha > 0.01 ? "good" : alpha < -0.01 ? "bad" : "neutral"} />
                    </div>
                    <div style={{ flex:1, minWidth:280, background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:4, padding:"12px 8px 4px" }}>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={[
                          { name:"Risk-Free",    val: rf * 100 },
                          { name:"CAPM Expected", val: capmRet * 100 },
                          { name:"Actual 1Y",    val: ret1Y },
                        ]} margin={{ top:8, right:8, left:0, bottom:0 }}>
                          <XAxis dataKey="name" tick={{ fill:"#A9B8D0", fontSize:10, fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fill:"#64748B", fontSize:10, fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} width={48} />
                          <Tooltip formatter={(v: any) => [`${v.toFixed(2)}%`]} contentStyle={{ background:"#283552", border:"1px solid #4C6190", borderRadius:4, fontFamily:"IBM Plex Mono", fontSize:12, color:"#F1F5F9" }} />
                          <Bar dataKey="val" radius={[2,2,0,0]}>
                            <Cell fill="#4C6190" />
                            <Cell fill="#D4B45E" />
                            <Cell fill={ret1Y >= capmRet * 100 ? "#22C55E" : "#EF4444"} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:"0.72rem", color:"var(--text-secondary)", background:"#0d1425", border:"1px solid var(--border)", borderRadius:4, padding:"10px 14px", marginTop:10 }}>
                    E(R) = Rf + β × (Rm − Rf) = {(rf*100).toFixed(2)}% + {fmt(beta)} × (10% − {(rf*100).toFixed(2)}%) ={" "}
                    <span style={{ color:"var(--accent-gold)", fontWeight:600 }}>{(capmRet*100).toFixed(2)}%</span>
                    &nbsp;&nbsp;|&nbsp;&nbsp;1Y Actual:{" "}
                    <span style={{ color: ret1Y >= 0 ? "var(--positive)" : "var(--negative)" }}>{ret1Y >= 0 ? "+" : ""}{ret1Y.toFixed(1)}%</span>
                    &nbsp;&nbsp;|&nbsp;&nbsp;Jensen's α:{" "}
                    <span style={{ color: alpha! >= 0 ? "var(--positive)" : "var(--negative)", fontWeight:600 }}>{alpha! >= 0 ? "+" : ""}{(alpha! * 100).toFixed(2)}%</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Earnings History ── */}
          {earnings.length > 0 && (
            <>
              <SectionLabel>Earnings History</SectionLabel>
              <div style={{ background:"var(--bg-surface)", border:"1px solid var(--border)", borderRadius:4, padding:"12px 8px 4px", marginBottom:12 }}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={earnings.filter((e: any) => e.surprise != null).map((e: any) => ({ name: (e.date ?? "").slice(0,10), val: e.surprise }))} margin={{ top:4, right:8, left:0, bottom:0 }}>
                    <XAxis dataKey="name" tick={{ fill:"#64748B", fontSize:9, fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => `${v.toFixed(0)}%`} tick={{ fill:"#64748B", fontSize:9, fontFamily:"IBM Plex Mono" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v: any) => [`${v.toFixed(1)}%`, "Surprise"]} contentStyle={{ background:"#283552", border:"1px solid #4C6190", borderRadius:4, fontFamily:"IBM Plex Mono", fontSize:11, color:"#F1F5F9" }} />
                    <Bar dataKey="val" radius={[2,2,0,0]}>
                      {earnings.filter((e: any) => e.surprise != null).map((e: any, i: number) => (
                        <Cell key={i} fill={e.surprise >= 0 ? "#059669" : "#dc2626"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table
                headers={["Date","EPS Estimate","Actual EPS","Surprise"]}
                rows={earnings.map((e: any) => [
                  (e.date ?? "").slice(0,10),
                  e.estimate != null ? `$${e.estimate.toFixed(2)}` : "—",
                  e.actual   != null ? `$${e.actual.toFixed(2)}`   : "—",
                  e.surprise != null ? { value:`${e.surprise >= 0 ? "+" : ""}${e.surprise.toFixed(1)}%`, color: e.surprise >= 0 ? "var(--positive)" : "var(--negative)" } : "—",
                ])} />
            </>
          )}

          {/* ── Analyst Consensus (Finnhub) ── */}
          {recs && recs.length > 0 && (
            <>
              <SectionLabel>Analyst Recommendations</SectionLabel>
              <Grid cols={6}>
                {(["strongBuy","buy","hold","sell","strongSell"] as const).map((k, i) => {
                  const labels = ["Strong Buy","Buy","Hold","Sell","Strong Sell"];
                  const total  = (["strongBuy","buy","hold","sell","strongSell"] as const).reduce((s, kk) => s + (recs[0][kk] ?? 0), 0) || 1;
                  const v = recs[0][k] ?? 0;
                  return <MCard key={k} label={labels[i]} value={String(v)} sub={`${((v/total)*100).toFixed(0)}%`} />;
                })}
                {(() => {
                  const total = (["strongBuy","buy","hold","sell","strongSell"] as const).reduce((s, k) => s + (recs[0][k] ?? 0), 0) || 1;
                  const bull = (recs[0].strongBuy ?? 0) + (recs[0].buy ?? 0);
                  const bear = (recs[0].sell ?? 0) + (recs[0].strongSell ?? 0);
                  const skew = ((bull - bear) / total * 100);
                  return <MCard label="Consensus Skew" value={`${skew >= 0 ? "+" : ""}${skew.toFixed(0)}%`}
                    sub={skew > 40 ? "Very Bullish" : skew > 15 ? "Bullish" : skew < -15 ? "Bearish" : "Neutral"}
                    tone={skew > 15 ? "good" : skew < -15 ? "bad" : "neutral"} />;
                })()}
              </Grid>
            </>
          )}

          {/* ── Consensus Estimates ── */}
          {futureEsts.length > 0 && (
            <>
              <SectionLabel>Consensus Estimates — EPS &amp; Revenue</SectionLabel>
              <Table
                headers={["Fiscal Year","Revenue Est.","Rev Range","EPS Est.","EPS Range","Analysts"]}
                rows={futureEsts.map((e: any) => [
                  { value:`FY ${e.date.slice(0,4)}`, color:"#3B82F6", bold:true },
                  e.revenueAvg  != null ? fmtLarge(e.revenueAvg)  : "—",
                  e.revenueLow != null && e.revenueHigh != null ? `${fmtLarge(e.revenueLow)} – ${fmtLarge(e.revenueHigh)}` : "—",
                  e.epsAvg != null ? { value:`$${e.epsAvg.toFixed(2)}`, color: e.epsAvg >= 0 ? "var(--positive)" : "var(--negative)", bold:true } : "—",
                  e.epsLow != null && e.epsHigh != null ? `$${e.epsLow.toFixed(2)} – $${e.epsHigh.toFixed(2)}` : "—",
                  e.numAnalysts ?? "—",
                ])} />
              <div style={{ fontSize:"0.65rem", color:"var(--text-muted)", marginTop:6 }}>Consensus EPS &amp; revenue estimates · Not financial advice.</div>
            </>
          )}

          {/* ── Insider Activity ── */}
          <SectionLabel>Insider Activity — SEC EDGAR Form 4</SectionLabel>
          {insiders.length > 0 ? (
            <>
              <Grid cols={4}>
                <MCard label="Insider Buys"  value={String(insiderBuys)}  sub="Recent Form 4 purchases" tone={insiderBuys > 0 ? "good" : "default"} />
                <MCard label="Insider Sells" value={String(insiderSells)} sub="Recent Form 4 disposals" tone={insiderSells > insiderBuys ? "bad" : "default"} />
                <MCard label="Net Shares (Buy−Sell)" value={netShares >= 0 ? `+${netShares.toLocaleString()}` : netShares.toLocaleString()} sub="Positive = net accumulation" tone={netShares > 0 ? "good" : netShares < 0 ? "bad" : "default"} />
                <MCard label="Total Volume" value={totalInsiderVal >= 1e9 ? `$${(totalInsiderVal/1e9).toFixed(2)}B` : totalInsiderVal >= 1e6 ? `$${(totalInsiderVal/1e6).toFixed(1)}M` : totalInsiderVal > 0 ? `$${totalInsiderVal.toLocaleString()}` : "—"} sub="Combined transaction value" />
              </Grid>
              <div style={{ marginTop:12 }}>
                <Table headers={["Date","Insider","Title","Type","Shares","Price","Value","Shares Owned"]}
                  rows={insiders.slice(0,20).map((t: any) => [
                    t.date ?? "—",
                    { value: t.name, color:"var(--text-primary)", bold:true },
                    { value: t.title, color:"var(--text-secondary)" },
                    { value: t.type, color: t.type === "BUY" ? "var(--positive)" : t.type === "SELL" ? "var(--negative)" : "var(--text-secondary)", badge: true },
                    t.shares ? t.shares.toLocaleString(undefined,{maximumFractionDigits:0}) : "—",
                    t.price  ? `$${t.price.toFixed(2)}` : "—",
                    t.value  ? (t.value >= 1e6 ? `$${(t.value/1e6).toFixed(1)}M` : t.value >= 1e3 ? `$${(t.value/1e3).toFixed(0)}K` : `$${t.value.toLocaleString()}`) : "—",
                    t.owned  ? t.owned.toLocaleString(undefined,{maximumFractionDigits:0}) : "—",
                  ])} />
                <div style={{ fontSize:"0.65rem", color:"var(--text-muted)", marginTop:6 }}>SEC EDGAR Form 4 · BUY = acquisition · SELL = disposal · No API key required.</div>
              </div>
            </>
          ) : (
            <div style={{ color:"var(--text-muted)", fontSize:"0.82rem", padding:"12px 0" }}>No recent Form 4 filings found for this ticker.</div>
          )}

          {/* ── Institutional Holders ── */}
          {institutional.length > 0 && (
            <>
              <SectionLabel>Institutional Holders</SectionLabel>
              <Table
                headers={["Holder", "Shares", "% of Float", "Change"]}
                rows={institutional.map((h: any) => [
                  { value: h.holder ?? h.investorName ?? "—", color: "var(--text-primary)", bold: true },
                  h.shares != null ? h.shares.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "—",
                  h.sharesPercent != null
                    ? `${(h.sharesPercent * 100).toFixed(2)}%`
                    : h.percentOfShare != null
                    ? `${h.percentOfShare.toFixed(2)}%`
                    : "—",
                  h.change != null
                    ? {
                        value: `${h.change >= 0 ? "+" : ""}${h.change.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                        color: h.change >= 0 ? "var(--positive)" : "var(--negative)",
                      }
                    : "—",
                ])}
              />
              <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: 6 }}>Top 10 institutional holders · Not financial advice.</div>
            </>
          )}

          {/* ── Company Description ── */}
          {s.description && <AboutSection description={s.description} />}

          {/* ── News ── */}
          {news.length > 0 && (
            <>
              <SectionLabel>Recent News — Finnhub</SectionLabel>
              {news.map((article: any, i: number) => {
                const date = article.datetime ? new Date(article.datetime * 1000).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
                const summary = article.summary?.length > 160 ? article.summary.slice(0,160) + "…" : article.summary;
                return (
                  <div key={i} style={{ padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
                    <a href={article.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily:"'IBM Plex Sans', sans-serif", color:"var(--text-primary)", fontWeight:500, fontSize:"0.85rem", textDecoration:"none", lineHeight:1.45 }}>
                      {article.headline}
                    </a>
                    <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.68rem", color:"var(--border-active)", marginTop:4 }}>
                      {article.source} · {date}
                    </div>
                    {summary && <div style={{ fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.75rem", color:"var(--text-secondary)", marginTop:4 }}>{summary}</div>}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ResearchPage() {
  return (
    <Suspense fallback={null}>
      <ResearchInner />
    </Suspense>
  );
}

// ── Reusable table component ──────────────────────────────────────────────────
type CellVal = string | number | { value: string; color?: string; bold?: boolean; badge?: boolean };

function Table({ headers, rows }: { headers: string[]; rows: CellVal[][] }) {
  return (
    <div style={{ overflowX:"auto", border:"1px solid var(--border)", borderRadius:4 }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"'IBM Plex Mono',monospace", fontSize:"0.78rem" }}>
        <thead>
          <tr style={{ background:"var(--bg-primary)" }}>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding:"8px 14px", fontFamily:"'IBM Plex Sans', sans-serif", fontSize:"0.58rem", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.12em", color:"var(--text-secondary)", borderBottom:"1px solid var(--border)", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
              {row.map((cell, ci) => {
                const isObj = typeof cell === "object" && cell !== null;
                const val   = isObj ? (cell as any).value : String(cell);
                const color = isObj ? (cell as any).color : "var(--text-secondary)";
                const bold  = isObj && (cell as any).bold;
                const badge = isObj && (cell as any).badge;
                return (
                  <td key={ci} style={{ textAlign: ci === 0 ? "left" : "right", padding:"8px 14px", borderBottom:"1px solid var(--border)", color: ci === 0 ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace:"nowrap" }}>
                    {badge ? (
                      <span style={{ background: color === "var(--positive)" ? "rgba(34,197,94,0.12)" : color === "var(--negative)" ? "rgba(239,68,68,0.12)" : "rgba(148,163,184,0.1)", color, padding:"2px 8px", borderRadius:3, fontSize:"0.70rem", fontWeight:600 }}>{val}</span>
                    ) : (
                      <span style={{ color, fontWeight: bold ? 600 : undefined }}>{val}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
