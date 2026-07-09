"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";

// ─── types ────────────────────────────────────────────────────────────────────

interface Position {
  ticker: string;
  shares: number;
  avgCost: number;
}

interface HoldingData {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  sector: string;
  beta: number | null;
  pe: number | null;
  divYield: number | null;
  nextEarnings: string | null;
  history: { date: string; price: number }[];
}

const STORAGE_KEY = "prometheon_portfolio_v1";

const PIE_COLORS = [
  "#D4B45E", "#5B8DEF", "#2ED573", "#A78BFA", "#F0564A",
  "#14B8A6", "#F97316", "#EC4899", "#84CC16", "#8C7A5B",
  "#60A5FA", "#C97B3D",
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtLarge(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function plColor(n: number | null | undefined) {
  if (n == null) return "var(--text-secondary)";
  return n >= 0 ? "var(--positive)" : "var(--negative)";
}

// Arrow-key navigation between form fields
function navKeys(e: React.KeyboardEvent<HTMLInputElement>) {
  const el = e.currentTarget;
  const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-nav]"))
    .sort((a, b) => Number(a.dataset.nav) - Number(b.dataset.nav));
  const idx = fields.indexOf(el as HTMLElement);
  if (idx < 0) return;
  const caret = el.selectionStart;
  const len = el.value.length;
  if (e.key === "ArrowRight" && caret === len) {
    const next = fields[idx + 1];
    if (next) { e.preventDefault(); next.focus(); if (next instanceof HTMLInputElement) next.select(); }
  } else if (e.key === "ArrowLeft" && caret === 0) {
    const prev = fields[idx - 1];
    if (prev) { e.preventDefault(); prev.focus(); if (prev instanceof HTMLInputElement) prev.select(); }
  }
}

// ─── styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: "0.85rem",
  fontFamily: "'IBM Plex Mono', monospace",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.58rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: "0.35rem",
  display: "block",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: "0.60rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  color: "var(--text-secondary)",
  marginBottom: 12,
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "16px 18px",
};

const CHART_TOOLTIP = {
  labelStyle: { color: "#F1F5F9" },
  itemStyle: { color: "#F1F5F9" },
  contentStyle: { background: "#283552", border: "1px solid #4C6190", borderRadius: 4, fontFamily: "IBM Plex Mono", fontSize: 12 },
};

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "14px 16px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.35rem", fontWeight: 700, color: "var(--text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: subColor ?? "var(--text-secondary)", marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>{sub}</div>}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [holdings, setHoldings] = useState<HoldingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  // add-form state
  const [fTicker, setFTicker] = useState("");
  const [fShares, setFShares] = useState("");
  const [fCost, setFCost] = useState("");

  // Load saved portfolio on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Position[];
        if (Array.isArray(saved) && saved.length > 0) {
          setPositions(saved);
          refresh(saved);
        }
      }
    } catch { /* corrupted storage — start fresh */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Position[]) {
    setPositions(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function refresh(list: Position[]) {
    if (list.length === 0) { setHoldings([]); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/portfolio?t=${list.map(p => p.ticker).join(",")}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setHoldings(d.holdings ?? []);
        setSpyHistory(d.spyHistory ?? []);
        setLoading(false);
        setLoadedOnce(true);
      })
      .catch(() => { setError("Failed to load market data. Try refreshing."); setLoading(false); });
  }

  const [spyHistory, setSpyHistory] = useState<{ date: string; price: number }[]>([]);

  function addPosition() {
    const ticker = fTicker.trim().toUpperCase();
    const shares = parseFloat(fShares);
    const avgCost = parseFloat(fCost);
    if (!ticker || !shares || shares <= 0 || !avgCost || avgCost <= 0) return;
    const existing = positions.find(p => p.ticker === ticker);
    let next: Position[];
    if (existing) {
      // merge: weighted average cost
      const totShares = existing.shares + shares;
      const totCost = existing.shares * existing.avgCost + shares * avgCost;
      next = positions.map(p => p.ticker === ticker ? { ticker, shares: totShares, avgCost: totCost / totShares } : p);
    } else {
      next = [...positions, { ticker, shares, avgCost }];
    }
    persist(next);
    setFTicker(""); setFShares(""); setFCost("");
    refresh(next);
  }

  function removePosition(ticker: string) {
    const next = positions.filter(p => p.ticker !== ticker);
    persist(next);
    if (next.length > 0) refresh(next);
    else { setHoldings([]); setLoadedOnce(false); }
  }

  // ── Derived analytics ──
  const byTicker = new Map(holdings.map(h => [h.ticker, h]));
  const rows = positions.map(p => {
    const h = byTicker.get(p.ticker);
    const price = h?.price ?? null;
    const value = price != null ? price * p.shares : null;
    const cost = p.avgCost * p.shares;
    const pl = value != null ? value - cost : null;
    const plPct = pl != null && cost > 0 ? (pl / cost) * 100 : null;
    const prevClose = price != null && h?.changePct != null ? price / (1 + h.changePct / 100) : null;
    const dayPl = price != null && prevClose != null ? (price - prevClose) * p.shares : null;
    return { ...p, h, price, value, cost, pl, plPct, dayPl };
  });

  const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalPl = totalValue - totalCost;
  const totalPlPct = totalCost > 0 ? (totalPl / totalCost) * 100 : 0;
  const dayPl = rows.reduce((s, r) => s + (r.dayPl ?? 0), 0);
  const dayPlPct = totalValue - dayPl !== 0 ? (dayPl / (totalValue - dayPl)) * 100 : 0;
  const annualDividends = rows.reduce((s, r) =>
    s + ((r.h?.divYield ?? 0) * (r.value ?? 0)), 0);

  // Weighted stats
  const weightedBeta = totalValue > 0
    ? rows.reduce((s, r) => s + ((r.h?.beta ?? 1) * (r.value ?? 0)), 0) / totalValue
    : null;
  const peRows = rows.filter(r => r.h?.pe != null && r.h.pe > 0 && r.value != null);
  const peValue = peRows.reduce((s, r) => s + (r.value ?? 0), 0);
  const weightedPe = peValue > 0
    ? peRows.reduce((s, r) => s + (r.h!.pe! * (r.value ?? 0)), 0) / peValue
    : null;
  const portfolioYield = totalValue > 0 ? (annualDividends / totalValue) * 100 : 0;

  // Allocation
  const allocByStock = rows
    .filter(r => r.value != null && r.value > 0)
    .map(r => ({ name: r.ticker, value: Math.round(r.value!) }))
    .sort((a, b) => b.value - a.value);
  const sectorMap = new Map<string, number>();
  rows.forEach(r => {
    if (r.value == null) return;
    const sec = r.h?.sector ?? "Other";
    sectorMap.set(sec, (sectorMap.get(sec) ?? 0) + r.value);
  });
  const allocBySector = Array.from(sectorMap.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // Performance vs SPY (% return, common date spine from SPY)
  const perfData: Record<string, number | string>[] = [];
  if (spyHistory.length > 10 && rows.some(r => (r.h?.history?.length ?? 0) > 10)) {
    const priceMaps = rows
      .filter(r => (r.h?.history?.length ?? 0) > 0)
      .map(r => ({
        shares: r.shares,
        map: new Map(r.h!.history.map(pt => [pt.date, pt.price])),
        last: null as number | null,
      }));
    let spyBase: number | null = null;
    let portBase: number | null = null;
    for (const pt of spyHistory) {
      let portVal = 0;
      let missing = false;
      for (const pm of priceMaps) {
        const px = pm.map.get(pt.date) ?? pm.last;
        if (px == null) { missing = true; continue; }
        pm.last = px;
        portVal += px * pm.shares;
      }
      if (missing && portVal === 0) continue;
      if (spyBase == null) { spyBase = pt.price; portBase = portVal; }
      if (spyBase && portBase) {
        perfData.push({
          date: pt.date,
          Portfolio: ((portVal / portBase) - 1) * 100,
          "S&P 500": ((pt.price / spyBase) - 1) * 100,
        });
      }
    }
  }

  // Insights
  const insights: { text: string; tone: "warn" | "info" | "good" }[] = [];
  if (totalValue > 0) {
    const top = allocByStock[0];
    if (top && top.value / totalValue > 0.3) {
      insights.push({ tone: "warn", text: `Concentration risk: ${top.name} is ${((top.value / totalValue) * 100).toFixed(0)}% of your portfolio. A single bad quarter moves everything.` });
    }
    const topSector = allocBySector[0];
    if (topSector && topSector.value / totalValue > 0.5 && allocBySector.length > 1) {
      insights.push({ tone: "warn", text: `Sector concentration: ${((topSector.value / totalValue) * 100).toFixed(0)}% of the portfolio sits in ${topSector.name}.` });
    }
    if (weightedBeta != null && weightedBeta > 1.3) {
      insights.push({ tone: "warn", text: `High volatility: weighted beta of ${weightedBeta.toFixed(2)} means this portfolio swings ~${((weightedBeta - 1) * 100).toFixed(0)}% harder than the market.` });
    } else if (weightedBeta != null && weightedBeta < 0.8) {
      insights.push({ tone: "good", text: `Defensive tilt: weighted beta of ${weightedBeta.toFixed(2)} — this portfolio should dampen market swings.` });
    }
    const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = rows.filter(r => r.h?.nextEarnings && r.h.nextEarnings >= today && r.h.nextEarnings <= twoWeeks);
    if (upcoming.length > 0) {
      insights.push({ tone: "info", text: `Earnings ahead: ${upcoming.map(r => `${r.ticker} (${r.h!.nextEarnings})`).join(", ")} report within two weeks.` });
    }
    if (portfolioYield > 0.5) {
      insights.push({ tone: "good", text: `Income: holdings pay an estimated $${Math.round(annualDividends).toLocaleString()}/year in dividends (${portfolioYield.toFixed(2)}% yield).` });
    }
  }

  const hasData = loadedOnce && rows.length > 0 && totalValue > 0;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
        My Portfolio
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, margin: "0.6rem 0" }} />
      <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.25rem 0 1.5rem" }}>
        Add your positions — saved in this browser, priced live, benchmarked against the S&amp;P 500
      </p>

      {/* Add position form */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px 18px", alignItems: "end" }}>
          <div>
            <label style={labelStyle}>Ticker</label>
            <input data-nav={0} value={fTicker} onChange={e => setFTicker(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === "Enter") addPosition(); navKeys(e); }} placeholder="Ticker" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Shares</label>
            <input data-nav={1} inputMode="decimal" value={fShares} onChange={e => setFShares(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addPosition(); navKeys(e); }} placeholder="10" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Avg Cost / Share ($)</label>
            <input data-nav={2} inputMode="decimal" value={fCost} onChange={e => setFCost(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addPosition(); navKeys(e); }} placeholder="150.00" style={inputStyle} />
          </div>
          <button onClick={addPosition} style={{
            padding: "10px 24px", background: "var(--accent-gold)", border: "none", borderRadius: 4,
            color: "#131C2E", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            Add Position
          </button>
          {positions.length > 0 && (
            <button onClick={() => refresh(positions)} disabled={loading} style={{
              padding: "10px 18px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4,
              color: "var(--text-secondary)", fontSize: "0.72rem", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif",
            }}>
              {loading ? "Refreshing…" : "Refresh Prices"}
            </button>
          )}
        </div>
        <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10 }}>
          Adding a ticker you already hold merges it into a weighted average cost. Data stays on your device.
        </div>
      </div>

      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</div>}

      {/* Empty state */}
      {positions.length === 0 && (
        <div>
          {[["Portfolio Stats", "Total value, profit & loss, today's move, and estimated dividend income."],
            ["Performance vs S&P 500", "Your combined holdings' 1-year return curve against the index."],
            ["Allocation", "Weight by position and by sector — spot concentration at a glance."],
            ["Smart Insights", "Automatic flags: concentration risk, high beta, upcoming earnings."]].map(([title, desc]) => (
            <div key={title} style={{ marginBottom: "1.25rem" }}>
              <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.5rem" }}>{title}</div>
              <div style={{ border: "1px dashed var(--border-active)", borderRadius: 4, background: "var(--bg-surface)", padding: "30px 20px", textAlign: "center" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && !loadedOnce && positions.length > 0 && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
          Pricing your portfolio…
        </div>
      )}

      {hasData && (
        <>
          {/* Hero stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
            <Stat label="Total Value" value={fmtLarge(totalValue)} sub={`${positions.length} position${positions.length !== 1 ? "s" : ""}`} />
            <Stat label="Total P/L" value={`${totalPl >= 0 ? "+" : "−"}${fmtLarge(Math.abs(totalPl)).replace("$", "$")}`}
              sub={`${totalPlPct >= 0 ? "+" : ""}${totalPlPct.toFixed(2)}% vs cost`} subColor={plColor(totalPl)} />
            <Stat label="Today" value={`${dayPl >= 0 ? "+" : "−"}$${fmtMoney(Math.abs(dayPl), 0)}`}
              sub={`${dayPlPct >= 0 ? "+" : ""}${dayPlPct.toFixed(2)}% today`} subColor={plColor(dayPl)} />
            <Stat label="Est. Dividends / Yr" value={`$${fmtMoney(annualDividends, 0)}`} sub={`${portfolioYield.toFixed(2)}% yield`} />
            <Stat label="Weighted Beta" value={weightedBeta != null ? weightedBeta.toFixed(2) : "—"}
              sub={weightedBeta != null ? (weightedBeta > 1.15 ? "More volatile than market" : weightedBeta < 0.85 ? "Defensive" : "Market-like") : undefined} />
            <Stat label="Weighted P/E" value={weightedPe != null ? `${weightedPe.toFixed(1)}×` : "—"} sub="Value-weighted TTM" />
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
              {insights.map((ins, i) => {
                const c = ins.tone === "warn" ? "var(--accent-gold)" : ins.tone === "good" ? "var(--positive)" : "#5B8DEF";
                return (
                  <div key={i} style={{
                    background: "var(--bg-surface)", border: "1px solid var(--border)", borderLeft: `3px solid ${c}`,
                    borderRadius: 4, padding: "10px 16px", fontSize: "0.8rem", color: "var(--text-primary)", lineHeight: 1.55,
                  }}>
                    {ins.text}
                  </div>
                );
              })}
            </div>
          )}

          {/* Performance vs SPY */}
          {perfData.length > 10 && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
              <div style={sectionLabel}>1-Year Performance — Portfolio vs S&amp;P 500 (current holdings, % return)</div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={perfData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="date" tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false}
                    tickFormatter={(d: any) => String(d).slice(0, 7)} minTickGap={70} />
                  <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip {...CHART_TOOLTIP} formatter={(v: any) => [`${Number(v).toFixed(1)}%`]} />
                  <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 13 }} />
                  <Line type="monotone" dataKey="Portfolio" stroke="#D4B45E" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="S&P 500" stroke="#5B8DEF" strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 6 }}>
                Assumes you held today&apos;s share counts for the whole year — a what-if curve for your current mix, not your actual trade history.
              </div>
            </div>
          )}

          {/* Allocation donuts */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[["By Position", allocByStock], ["By Sector", allocBySector]].map(([title, data]) => (
              <div key={title as string} style={{ ...cardStyle, flex: 1, minWidth: 300 }}>
                <div style={sectionLabel}>Allocation — {title as string}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data as any[]} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95}
                      paddingAngle={2} isAnimationActive={false} stroke="var(--bg-surface)">
                      {(data as any[]).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP}
                      formatter={(v: any, name: any) => [`$${Number(v).toLocaleString()} · ${((Number(v) / totalValue) * 100).toFixed(1)}%`, name]} />
                    <Legend wrapperStyle={{ fontFamily: "IBM Plex Mono", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>

          {/* Holdings table */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4, marginBottom: "0.5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  {["Ticker", "Shares", "Avg Cost", "Price", "Day", "Mkt Value", "Weight", "P/L $", "P/L %", ""].map((h, i) => (
                    <th key={h || "actions"} style={{
                      textAlign: i === 0 ? "left" : "right", padding: "9px 12px",
                      fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem", fontWeight: 500,
                      textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)",
                      borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const cell: React.CSSProperties = { padding: "9px 12px", textAlign: "right", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", whiteSpace: "nowrap" };
                  const weight = r.value != null && totalValue > 0 ? (r.value / totalValue) * 100 : null;
                  return (
                    <tr key={r.ticker} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                      <td style={{ ...cell, textAlign: "left" }}>
                        <Link href={`/research?ticker=${r.ticker}`} style={{ color: "var(--accent-gold)", fontWeight: 700, textDecoration: "none" }}>
                          {r.ticker}
                        </Link>
                      </td>
                      <td style={cell}>{r.shares.toLocaleString()}</td>
                      <td style={cell}>${fmtMoney(r.avgCost)}</td>
                      <td style={{ ...cell, color: "var(--text-primary)" }}>{r.price != null ? `$${fmtMoney(r.price)}` : "—"}</td>
                      <td style={{ ...cell, color: plColor(r.h?.changePct) }}>
                        {r.h?.changePct != null ? `${r.h.changePct >= 0 ? "+" : ""}${r.h.changePct.toFixed(2)}%` : "—"}
                      </td>
                      <td style={{ ...cell, color: "var(--text-primary)", fontWeight: 600 }}>{r.value != null ? `$${fmtMoney(r.value, 0)}` : "—"}</td>
                      <td style={cell}>{weight != null ? `${weight.toFixed(1)}%` : "—"}</td>
                      <td style={{ ...cell, color: plColor(r.pl) }}>{r.pl != null ? `${r.pl >= 0 ? "+" : "−"}$${fmtMoney(Math.abs(r.pl), 0)}` : "—"}</td>
                      <td style={{ ...cell, color: plColor(r.plPct) }}>{r.plPct != null ? `${r.plPct >= 0 ? "+" : ""}${r.plPct.toFixed(1)}%` : "—"}</td>
                      <td style={{ ...cell }}>
                        <button onClick={() => removePosition(r.ticker)} title="Remove position" style={{
                          background: "transparent", border: "1px solid var(--border)", borderRadius: 3,
                          color: "var(--text-muted)", cursor: "pointer", padding: "2px 8px", fontSize: "0.7rem",
                        }}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-muted)" }}>
            Positions are stored in your browser only · Click a ticker to open Research · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}
