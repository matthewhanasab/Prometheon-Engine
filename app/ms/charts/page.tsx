"use client";
import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import MsNav from "@/components/MsNav";
import ChartShotButton from "@/components/ChartShotButton";

// Financial Charts — Market Stack edition. Mirrors /charts chart-for-chart:
// same section order, TTM toggles, QoQ labels, gold bars and screenshot
// buttons. Quarterly fundamentals come from SEC EDGAR XBRL; the valuation
// multiples pair those against marketstack prices.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)",
  borderRadius: 22, padding: "12px 8px 4px",
};
const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 600,
  color: "var(--text-primary)", marginBottom: "0.5rem", marginTop: "1.5rem",
  letterSpacing: "0.01em",
};
const X_TICK = { fill: "var(--tick)", fontSize: 16 };
const Y_TICK = { fill: "var(--tick)", fontSize: 16 };
const TOOLTIP_STYLE = {
  cursor: { fill: "var(--cursor-fill)" },
  labelStyle: { color: "var(--text-primary)" },
  itemStyle: { color: "var(--text-primary)" },
  contentStyle: {
    background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)",
    borderRadius: 22, fontFamily: "Spline Sans Mono, monospace", fontSize: 15,
    color: "var(--text-primary)",
  },
};

function fmtVal(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "N/A";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}
function fmtShares(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

function TtmToggle({ isTtm, onChange }: { isTtm: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {(["Quarterly", "TTM"] as const).map((opt) => {
        const active = isTtm === (opt === "TTM");
        return (
          <button key={opt} onClick={() => onChange(opt === "TTM")} style={{
            background: active ? "var(--accent-gold)" : "var(--bg-elevated)",
            color: active ? "var(--on-accent)" : "var(--text-secondary)",
            border: "1px solid var(--border)", borderRadius: 24, padding: "3px 10px",
            fontSize: "0.68rem", fontFamily: SANS, cursor: "pointer",
          }}>{opt}</button>
        );
      })}
    </div>
  );
}

function QoQLabel(props: { x?: number; y?: number; width?: number; value?: number; index?: number; values: number[] }) {
  const { x = 0, y = 0, width = 0, value, index = 0, values } = props;
  if (index === 0 || value == null || !isFinite(value)) return null;
  const prev = values[index - 1];
  if (prev == null || prev === 0) return null;
  const pct = ((value - prev) / Math.abs(prev)) * 100;
  return (
    <text x={x + width / 2} y={y - 4} fill={pct >= 0 ? "#22C55E" : "#EF4444"} fontSize={13}
      textAnchor="middle" fontFamily="Spline Sans Mono, monospace">
      {`${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`}
    </text>
  );
}

/** Section header — carries the screenshot button, exactly like /charts. */
function SectionLabel({ children, ticker, companyName }: {
  children: React.ReactNode; ticker: string; companyName?: string;
}) {
  return (
    <div data-chart-section style={{ ...SECTION_LABEL_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <span data-section-title>{children}</span>
      {ticker && <ChartShotButton ticker={ticker} companyName={companyName} />}
    </div>
  );
}

/** Whole-chart placeholder for series marketstack/EDGAR can't supply. */
function NAChart({ reason }: { reason: string }) {
  return (
    <div style={{ ...CARD_STYLE, borderStyle: "dashed", padding: "26px 22px", opacity: 0.7 }}>
      <div style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 6 }}>
        Not available on Market Stack
      </div>
      <div style={{ fontFamily: SANS, fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.6 }}>{reason}</div>
    </div>
  );
}

type Pt = { date: string; label: string; value: number };

function ChartsInner() {
  const search = useSearchParams();
  const [inputTicker, setInputTicker] = useState(search.get("ticker") ?? "AAPL");
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const booted = useRef(false);

  // Independent TTM state per chart, matching the original.
  const [ttmRevenue, setTtmRevenue] = useState(false);
  const [ttmOCF, setTtmOCF] = useState(false);
  const [ttmOpInc, setTtmOpInc] = useState(false);
  const [ttmEPS, setTtmEPS] = useState(false);
  const [ttmFCF, setTtmFCF] = useState(false);
  const [ttmFCFPS, setTtmFCFPS] = useState(false);

  async function load(sym?: string) {
    const t = (sym ?? inputTicker).trim().toUpperCase();
    if (!t) return;
    setInputTicker(t); setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ms-charts/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json); setTicker(t);
    } catch (e: any) {
      setError(e?.message ?? "Failed"); setData(null); setTicker("");
    } finally { setLoading(false); }
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    load(search.get("ticker") ?? "AAPL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = data?.series;
  const company = data?.profile?.companyName;
  const pick = (grp: any, isTtm: boolean): Pt[] => (isTtm ? grp?.ttm : grp?.q) ?? [];

  // Only draw QoQ labels when bars are wide enough for the text to fit.
  const [cardW, setCardW] = useState(900);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!cardRef.current) return;
    const ro = new ResizeObserver((e) => setCardW(e[0].contentRect.width));
    ro.observe(cardRef.current);
    return () => ro.disconnect();
  }, [data]);
  const showQoQ = (n: number) => (cardW - 85) / Math.max(1, n) >= 42;

  const barChart = (rows: Pt[], fmtY: (v: number) => string, name: string, withQoQ = true) => (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={rows} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={fmtY} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
        <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [fmtY(Number(v)), name]} />
        <Bar dataKey="value" fill="var(--accent-gold)" radius={[2, 2, 0, 0]} isAnimationActive={false}
          label={withQoQ && showQoQ(rows.length) ? <QoQLabel values={rows.map((d) => d.value)} /> : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );

  const areaChart = (rows: Pt[], fmtY: (v: number) => string, name: string) => {
    const avg = rows.length ? rows.reduce((a, r) => a + r.value, 0) / rows.length : 0;
    return (
      <ResponsiveContainer width="100%" height={360}>
        <AreaChart data={rows} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`g-${name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-gold)" stopOpacity={0.34} />
              <stop offset="100%" stopColor="var(--accent-gold)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmtY} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
          <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [fmtY(Number(v)), name]} />
          <ReferenceLine y={avg} stroke="var(--text-muted)" strokeDasharray="4 4"
            label={{ value: `avg ${fmtY(avg)}`, fill: "var(--text-muted)", fontSize: 12, position: "insideTopRight" }} />
          <Area type="monotone" dataKey="value" stroke="var(--accent-gold)" strokeWidth={2.5}
            fill={`url(#g-${name})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  // Paired series for the two-line / two-bar charts.
  const marginRows = React.useMemo(() => {
    if (!s) return [];
    const gm = new Map((s.grossMargin as Pt[]).map((p) => [p.date, p.value]));
    return (s.netMargin as Pt[])
      .map((p) => ({ label: p.label, net: p.value, gross: gm.get(p.date) ?? null }))
      .filter((r) => r.gross != null);
  }, [s]);

  const liquidityRows = React.useMemo(() => {
    if (!s) return [];
    const cl = new Map((s.currentLiabilities as Pt[]).map((p) => [p.date, p.value]));
    return (s.currentAssets as Pt[])
      .map((p) => ({ label: p.label, assets: p.value, liabilities: cl.get(p.date) ?? null }))
      .filter((r) => r.liabilities != null);
  }, [s]);

  const cashDebtRows = React.useMemo(() => {
    if (!s) return [];
    const sti = new Map((s.shortTermInvestments as Pt[]).map((p) => [p.date, p.value]));
    const debt = new Map((s.debt as Pt[]).map((p) => [p.date, p.value]));
    return (s.cash as Pt[]).map((p) => ({
      label: p.label, cash: p.value,
      securities: sti.get(p.date) ?? 0, debt: debt.get(p.date) ?? 0,
    }));
  }, [s]);

  const yTickMoney = (v: number) => fmtVal(v).replace("$", "");
  const pctTick = (v: number) => `${v.toFixed(0)}%`;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.2rem" }}>
        Financial Charts
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
        Revenue · OCF · Operating Income · Margins · EPS · FCF · FCF/Share · PE · P/S · Shares · Equity · Segments · Cash vs Debt
      </p>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", marginBottom: "1.25rem" }} />

      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <input ref={inputRef} value={inputTicker}
          onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") { load(); inputRef.current?.blur(); } }}
          placeholder="Type a ticker…"
          style={{
            width: 180, background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 22, padding: "9px 14px", color: "var(--text-primary)",
            fontFamily: MONO, fontSize: "0.85rem", outline: "none",
          }} />
        <button onClick={() => load()} disabled={loading} style={{
          background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22,
          padding: "9px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}>{loading ? "Loading…" : "Load"}</button>
        {data?.profile && (
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
            {company}{data.profile.sector ? ` · ${data.profile.sector}` : ""}
          </span>
        )}
      </div>

      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {data && s && !loading && (
        <>
          {/* 1. Revenue */}
          <SectionLabel ticker={ticker} companyName={company}>Revenue</SectionLabel>
          <TtmToggle isTtm={ttmRevenue} onChange={setTtmRevenue} />
          <div style={CARD_STYLE} ref={cardRef}>
            {barChart(pick(s.revenue, ttmRevenue), yTickMoney, ttmRevenue ? "Revenue (TTM)" : "Revenue")}
          </div>

          {/* 2. Operating Cash Flow */}
          <SectionLabel ticker={ticker} companyName={company}>Operating Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmOCF} onChange={setTtmOCF} />
          <div style={CARD_STYLE}>{barChart(pick(s.ocf, ttmOCF), yTickMoney, "Operating Cash Flow")}</div>

          {/* 3. Operating Income */}
          <SectionLabel ticker={ticker} companyName={company}>Operating Income</SectionLabel>
          <TtmToggle isTtm={ttmOpInc} onChange={setTtmOpInc} />
          <div style={CARD_STYLE}>{barChart(pick(s.operatingIncome, ttmOpInc), yTickMoney, "Operating Income")}</div>

          {/* 4. Gross & Net Margin */}
          <SectionLabel ticker={ticker} companyName={company}>Gross &amp; Net Margin</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={marginRows} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={pctTick} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [`${Number(v).toFixed(1)}%`, n === "gross" ? "Gross Margin" : "Net Margin"]} />
                <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 13 }} formatter={(v) => (v === "gross" ? "Gross Margin" : "Net Margin")} />
                <Line type="monotone" dataKey="gross" stroke="var(--accent-gold)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="net" stroke="#22C55E" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 5. EPS */}
          <SectionLabel ticker={ticker} companyName={company}>Earnings Per Share (EPS)</SectionLabel>
          <TtmToggle isTtm={ttmEPS} onChange={setTtmEPS} />
          <div style={CARD_STYLE}>
            {barChart(pick(s.eps, ttmEPS), (v) => `$${v.toFixed(2)}`, "EPS")}
          </div>

          {/* 6. Free Cash Flow */}
          <SectionLabel ticker={ticker} companyName={company}>Free Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmFCF} onChange={setTtmFCF} />
          <div style={CARD_STYLE}>{barChart(pick(s.fcf, ttmFCF), yTickMoney, "Free Cash Flow")}</div>

          {/* 7. FCF Per Share */}
          <SectionLabel ticker={ticker} companyName={company}>Free Cash Flow Per Share</SectionLabel>
          <TtmToggle isTtm={ttmFCFPS} onChange={setTtmFCFPS} />
          <div style={CARD_STYLE}>
            {barChart(pick(s.fcfPerShare, ttmFCFPS), (v) => `$${v.toFixed(2)}`, "FCF / Share")}
          </div>

          {/* 8. Historical PE */}
          <SectionLabel ticker={ticker} companyName={company}>Historical PE Ratio</SectionLabel>
          <div style={CARD_STYLE}>{areaChart(s.pe ?? [], (v) => `${v.toFixed(1)}×`, "PE")}</div>

          {/* 9. Historical P/S */}
          <SectionLabel ticker={ticker} companyName={company}>Historical Price / Sales (P/S)</SectionLabel>
          <div style={CARD_STYLE}>{areaChart(s.ps ?? [], (v) => `${v.toFixed(1)}×`, "PS")}</div>

          {/* 10. Shares Outstanding */}
          <SectionLabel ticker={ticker} companyName={company}>Shares Outstanding</SectionLabel>
          <div style={CARD_STYLE}>{barChart(s.shares ?? [], fmtShares, "Shares", false)}</div>

          {/* 11. Shareholders' Equity */}
          <SectionLabel ticker={ticker} companyName={company}>Shareholders&apos; Equity</SectionLabel>
          <div style={CARD_STYLE}>{barChart(s.equity ?? [], yTickMoney, "Equity", false)}</div>

          {/* 12. Revenue by Product */}
          <SectionLabel ticker={ticker} companyName={company}>Revenue by Product</SectionLabel>
          <NAChart reason="Segment revenue lives in XBRL as dimensional facts (broken out along a product axis). The SEC's companyfacts API returns consolidated figures only, and marketstack has no segment endpoint — so neither source exposes this split." />

          {/* 13. Revenue by Geography */}
          <SectionLabel ticker={ticker} companyName={company}>Revenue by Geography</SectionLabel>
          <NAChart reason="Same as product segments — geographic revenue is a dimensional XBRL breakdown that the companyfacts API doesn't return." />

          {/* 14. Current Assets vs Liabilities */}
          <SectionLabel ticker={ticker} companyName={company}>Current Assets vs Liabilities</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={liquidityRows} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickMoney} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [fmtVal(Number(v)), n === "assets" ? "Current Assets" : "Current Liabilities"]} />
                <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 13 }} formatter={(v) => (v === "assets" ? "Current Assets" : "Current Liabilities")} />
                <Bar dataKey="assets" fill="var(--accent-gold)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="liabilities" fill="#EF4444" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 15. Cash · Securities · Debt */}
          <SectionLabel ticker={ticker} companyName={company}>Cash · Marketable Securities · Debt</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={cashDebtRows} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickMoney} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [fmtVal(Number(v)), n === "cash" ? "Cash" : n === "securities" ? "Marketable Securities" : "Debt"]} />
                <Legend wrapperStyle={{ fontFamily: MONO, fontSize: 13 }}
                  formatter={(v) => (v === "cash" ? "Cash" : v === "securities" ? "Securities" : "Debt")} />
                <Bar dataKey="cash" stackId="a" fill="var(--accent-gold)" isAnimationActive={false} />
                <Bar dataKey="securities" stackId="a" fill="#22C55E" fillOpacity={0.8} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="debt" fill="#EF4444" fillOpacity={0.75} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "1.6rem", lineHeight: 1.6 }}>
            Quarterly fundamentals from SEC EDGAR XBRL (10-K/10-Q), with fourth quarters reconstructed as
            FY − (Q1+Q2+Q3). Valuation multiples pair those against marketstack quarter-end closes. The
            revenue forecast overlay on the FMP page needs analyst estimates and has no equivalent here.
          </div>
        </>
      )}
    </div>
  );
}

export default function MsChartsPage() {
  return <Suspense fallback={null}><ChartsInner /></Suspense>;
}
