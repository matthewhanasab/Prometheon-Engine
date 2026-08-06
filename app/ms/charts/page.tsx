"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CompanyLogo from "@/components/CompanyLogo";
import MsNav from "@/components/MsNav";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// Financial Charts, Market Stack edition. Every series is an annual figure from
// SEC EDGAR XBRL (via /api/marketstack-stock → fundamentals.annual) — 10-K data,
// no licensed fundamentals provider involved.
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const PICKS = ["AAPL", "NVDA", "MSFT", "KO", "IREN"];

const fmtBig = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(2)}`;
};

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

function toSeries(arr: any[] | undefined): { year: string; val: number }[] {
  if (!Array.isArray(arr)) return [];
  return [...arr]
    .reverse() // API sends newest-first; charts read left→right in time
    .map((x) => ({ year: String(x.end ?? "").slice(0, 4), val: Number(x.val) }))
    .filter((x) => x.year && Number.isFinite(x.val));
}

function FinBarChart({ data, money = true }: { data: { year: string; val: number }[]; money?: boolean }) {
  if (data.length < 2) return <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.78rem", color: "var(--text-muted)" }}>Not enough annual data on file.</div>;
  return (
    <div style={{ ...CARD, padding: "18px 10px 6px", height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
          <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false}
            tickFormatter={(v: number) => money ? (Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(0)}B` : `${(v / 1e6).toFixed(0)}M`) : String(v)} width={52} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontFamily: MONO, fontSize: 12 }}
            labelStyle={{ color: "var(--text-secondary)" }}
            formatter={(v: any) => [money ? fmtBig(Number(v)) : Number(v).toFixed(2), ""]}
          />
          <Bar dataKey="val" radius={[6, 6, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.val >= 0 ? "var(--accent-gold)" : "var(--negative)"} fillOpacity={0.55 + 0.45 * (i / Math.max(1, data.length - 1))} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartsInner() {
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
      const res = await fetch(`/api/marketstack-stock/${t}`);
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

  const ann = data?.fundamentals?.annual;
  const revenue = toSeries(ann?.revenue);
  const netIncome = toSeries(ann?.netIncome);
  const ocf = toSeries(ann?.ocf);
  const eps = toSeries(ann?.eps);
  const marginByYear = revenue
    .map((r) => {
      const ni = netIncome.find((n) => n.year === r.year);
      return ni && r.val !== 0 ? { year: r.year, val: (ni.val / r.val) * 100 } : null;
    })
    .filter(Boolean) as { year: string; val: number }[];

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Financial Charts
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Ten years of audited annual figures, straight from SEC 10-K filings.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 360, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Chart"}
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

      {data && !loading && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "1.2rem 0 0.2rem" }}>
            <CompanyLogo ticker={data.ticker} size={40} />
            <span style={{ fontFamily: SERIF, fontSize: "1.3rem", fontWeight: 600 }}>{data.profile?.name ?? data.ticker}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.75rem", color: "var(--text-muted)" }}>fiscal years, as filed</span>
          </div>

          <SectionLabel>Revenue</SectionLabel>
          <FinBarChart data={revenue} />
          <SectionLabel>Net Income</SectionLabel>
          <FinBarChart data={netIncome} />
          <SectionLabel>Operating Cash Flow</SectionLabel>
          <FinBarChart data={ocf} />
          <SectionLabel>Diluted EPS</SectionLabel>
          <FinBarChart data={eps} money={false} />

          {marginByYear.length >= 2 && (
            <>
              <SectionLabel>Net Margin</SectionLabel>
              <div style={{ ...CARD, padding: "18px 10px 6px", height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={marginByYear} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={44} />
                    <Tooltip
                      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontFamily: MONO, fontSize: 12 }}
                      formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "net margin"]}
                    />
                    <Line type="monotone" dataKey="val" stroke="var(--positive)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--positive)" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "1.6rem" }}>
            Source: SEC EDGAR XBRL company facts (10-K filings). Quarterly, per-segment and geographic breakdowns
            are on the main Charts page via FMP only.
          </div>
        </>
      )}
    </div>
  );
}

export default function MsChartsPage() {
  return <Suspense fallback={null}><ChartsInner /></Suspense>;
}
