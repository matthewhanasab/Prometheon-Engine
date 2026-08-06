"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import CompanyLogo from "@/components/CompanyLogo";

import TradingViewWidget from "@/components/TradingViewWidget";

// Earnings — Market Stack edition.
//
// Two halves, from two sources that carry no licensing cost:
//   • upcoming calendar → TradingView events widget
//   • reported results  → SEC EDGAR, quarter by quarter, as filed
// Consensus estimates (and therefore beat/miss surprises) need an analyst feed
// no marketstack tier carries, so this page reports actuals only.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const PICKS = ["AAPL", "NVDA", "MSFT", "KO", "IREN"];

const fmtB = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e12) return `${s}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  return `${s}$${a.toFixed(0)}`;
};
const fmtEps = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`;

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>
      {hint && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.62rem" }}>{hint}</span>}
    </div>
  );
}

type Pt = { date: string; label: string; value: number };

function EarningsInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  async function load(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null);
    try {
      // Reuses the Charts endpoint — same EDGAR quarterly series, already cached.
      const res = await fetch(`/api/ms-charts/${t}`);
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
    load(search.get("ticker") ?? "AAPL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = data?.series;
  const eps: Pt[] = s?.eps?.q ?? [];
  const revenue: Pt[] = s?.revenue?.q ?? [];
  const netIncome: Pt[] = s?.netIncome?.q ?? [];

  // Newest-first table rows with YoY growth against the same quarter last year.
  const revByDate = new Map(revenue.map((p) => [p.date, p.value]));
  const niByDate = new Map(netIncome.map((p) => [p.date, p.value]));
  const rows = [...eps].reverse().slice(0, 16).map((p, i, arr) => {
    const yrAgo = arr[i + 4];
    const rev = revByDate.get(p.date) ?? null;
    const revYrAgo = yrAgo ? revByDate.get(yrAgo.date) ?? null : null;
    return {
      label: p.label,
      date: p.date,
      eps: p.value,
      epsYoY: yrAgo && yrAgo.value !== 0 ? (p.value / yrAgo.value - 1) * 100 : null,
      revenue: rev,
      revYoY: rev != null && revYrAgo ? (rev / revYrAgo - 1) * 100 : null,
      netIncome: niByDate.get(p.date) ?? null,
    };
  });

  const epsChart = eps.slice(-16);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Earnings
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Reported results by quarter, as filed with the SEC — plus the upcoming release calendar.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 360, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Type a ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Load"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.6rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => load(t)}
            style={{ background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)", color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px", fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</p>}

      {data && !loading && rows.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "1.2rem 0 0" }}>
            <CompanyLogo ticker={data.ticker} size={38} />
            <span style={{ fontFamily: SERIF, fontSize: "1.2rem", fontWeight: 600 }}>{data.profile?.companyName ?? data.ticker}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--text-muted)" }}>
              {rows.length} reported quarters
            </span>
          </div>

          <Label hint="diluted, as reported">Reported EPS by Quarter</Label>
          <div style={{ ...CARD, padding: "16px 8px 6px", height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={epsChart} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => `$${v.toFixed(2)}`} tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} width={62} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.04)" }}
                  contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontFamily: MONO, fontSize: 12 }}
                  formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "diluted EPS"]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {epsChart.map((p, i) => (
                    <Cell key={i} fill={p.value >= 0 ? "var(--accent-gold)" : "var(--negative)"}
                      fillOpacity={0.55 + 0.45 * (i / Math.max(1, epsChart.length - 1))} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <Label hint="year-over-year against the same quarter">Reported Results</Label>
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: MONO, fontSize: "0.77rem" }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <th style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600 }}>Quarter</th>
                  <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Period End</th>
                  <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Revenue</th>
                  <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Rev YoY</th>
                  <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Net Income</th>
                  <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Diluted EPS</th>
                  <th style={{ textAlign: "right", padding: "9px 14px", fontWeight: 600 }}>EPS YoY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 14px", fontWeight: 700, color: "var(--accent-gold)" }}>{r.label}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--text-muted)" }}>{r.date}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtB(r.revenue)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", color: r.revYoY == null ? "var(--text-muted)" : r.revYoY >= 0 ? "var(--positive)" : "var(--negative)" }}>
                      {r.revYoY == null ? "—" : `${r.revYoY >= 0 ? "+" : ""}${r.revYoY.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right" }}>{fmtB(r.netIncome)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600 }}>{fmtEps(r.eps)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: r.epsYoY == null ? "var(--text-muted)" : r.epsYoY >= 0 ? "var(--positive)" : "var(--negative)" }}>
                      {r.epsYoY == null ? "—" : `${r.epsYoY >= 0 ? "+" : ""}${r.epsYoY.toFixed(1)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 10 }}>
            Actuals only — consensus estimates, and therefore beat/miss surprises, need an analyst feed
            marketstack doesn&apos;t carry.{" "}
            <Link href={`/financials?ticker=${data.ticker}`} style={{ color: "var(--accent-gold)" }}>
              Full statements →
            </Link>
          </div>
        </>
      )}

      <Label hint="TradingView widget">Upcoming Release Calendar</Label>
      <TradingViewWidget
        widget="events"
        height={520}
        config={{ importanceFilter: "-1,0,1", countryFilter: "us,eu,gb,jp,cn" }}
      />
    </div>
  );
}

export default function MsEarningsPage() {
  return <Suspense fallback={null}><EarningsInner /></Suspense>;
}
