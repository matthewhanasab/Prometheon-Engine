"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import MsNav from "@/components/MsNav";

// Compare Stocks, Market Stack edition — every number via /api/marketstack-stock
// (marketstack + EDGAR + FRED), so per-ticker results are already server-cached.
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MAX = 4;

const money = (n: any) => (n == null || !isFinite(n) ? "—" : `$${Number(n).toFixed(2)}`);
const pctS = (n: any, d = 1) => (n == null || !isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(d)}%`);
const pctOf = (n: any, d = 1) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(d)}%`);
const mult = (n: any) => (n == null || !isFinite(n) ? "—" : `${Number(n).toFixed(2)}×`);
const big = (n: any) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${Number(n).toFixed(0)}`;
};
const tonePos = (v: number | null | undefined) =>
  v == null ? "var(--text-primary)" : v >= 0 ? "var(--positive)" : "var(--negative)";

function ret(d: any, years: number): number | null {
  const r = d?.longReturns?.find((x: any) => x.years === years && x.available);
  return r ? r.totalPct : null;
}

function CompareInner() {
  const search = useSearchParams();
  const [tickers, setTickers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Record<string, any>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const booted = useRef(false);

  async function add(sym: string) {
    const t = sym.trim().toUpperCase();
    if (!t || tickers.includes(t) || tickers.length >= MAX) return;
    setTickers((p) => [...p, t]);
    setInput("");
    setPending((p) => ({ ...p, [t]: true }));
    try {
      const res = await fetch(`/api/marketstack-stock/${t}`);
      const json = await res.json();
      if (res.ok && !json.error) setResults((p) => ({ ...p, [t]: json }));
      else setResults((p) => ({ ...p, [t]: { error: json.error ?? "failed" } }));
    } catch {
      setResults((p) => ({ ...p, [t]: { error: "failed" } }));
    } finally {
      setPending((p) => ({ ...p, [t]: false }));
    }
  }
  function remove(t: string) {
    setTickers((p) => p.filter((x) => x !== t));
    setResults((p) => { const n = { ...p }; delete n[t]; return n; });
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const q = (search.get("t") ?? "AAPL,MSFT").split(",").filter(Boolean).slice(0, MAX);
    q.forEach((t) => add(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols = tickers.map((t) => ({ t, d: results[t], busy: pending[t] }));
  const ROWS: { label: string; get: (d: any) => string; color?: (d: any) => string }[] = [
    { label: "Price", get: (d) => money(d?.quote?.price) },
    { label: "Day Change", get: (d) => pctS(d?.quote?.changePct, 2), color: (d) => tonePos(d?.quote?.changePct) },
    { label: "Market Cap", get: (d) => big(d?.fundamentals?.marketCap) },
    { label: "1Y Return", get: (d) => pctS(ret(d, 1), 0), color: (d) => tonePos(ret(d, 1)) },
    { label: "5Y Return", get: (d) => pctS(ret(d, 5), 0), color: (d) => tonePos(ret(d, 5)) },
    { label: "15Y Return", get: (d) => pctS(ret(d, 15), 0), color: (d) => tonePos(ret(d, 15)) },
    { label: "Beta (5Y)", get: (d) => (d?.capm?.beta != null ? d.capm.beta.toFixed(2) : "—") },
    { label: "TTM P/E", get: (d) => mult(d?.fundamentals?.peRatio) },
    { label: "Price / Sales", get: (d) => mult(d?.fundamentals?.ps) },
    { label: "Revenue (TTM)", get: (d) => big(d?.fundamentals?.revenue) },
    { label: "Revenue Growth", get: (d) => pctOf(d?.fundamentals?.revenueGrowth), color: (d) => tonePos(d?.fundamentals?.revenueGrowth) },
    { label: "Gross Margin", get: (d) => pctOf(d?.fundamentals?.grossMargin) },
    { label: "Net Margin", get: (d) => pctOf(d?.fundamentals?.netMargin) },
    { label: "ROE", get: (d) => pctOf(d?.fundamentals?.roe) },
    { label: "FCF Yield", get: (d) => pctOf(d?.fundamentals?.fcfYield) },
    { label: "Debt / Equity", get: (d) => mult(d?.fundamentals?.debtToEquity) },
    { label: "Dividend Yield", get: (d) => (d?.dividends?.yieldPct != null ? `${d.dividends.yieldPct.toFixed(2)}%` : "—") },
    { label: "F-Score", get: (d) => (d?.fundamentals?.piotroski ? `${d.fundamentals.piotroski.score}/${d.fundamentals.piotroski.outOf}` : "—") },
    { label: "Altman Z", get: (d) => (d?.fundamentals?.altmanZ != null ? d.fundamentals.altmanZ.toFixed(1) : "—") },
    { label: "Analyst Target", get: (d) => money(d?.consensus?.avgTarget) },
  ];

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Compare Stocks
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Up to {MAX} tickers side by side — marketstack prices &amp; ratings, SEC EDGAR fundamentals.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); add(input); }} style={{ display: "flex", gap: 10, maxWidth: 340, marginBottom: "0.8rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Add ticker…"
          disabled={tickers.length >= MAX}
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "9px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={tickers.length >= MAX}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "9px 20px", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", opacity: tickers.length >= MAX ? 0.5 : 1 }}>
          Add
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.4rem" }}>
        {tickers.map((t) => (
          <button key={t} onClick={() => remove(t)} title="Remove"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px", fontFamily: MONO, fontSize: "0.72rem", cursor: "pointer" }}>
            {t} ✕
          </button>
        ))}
      </div>

      {cols.length > 0 && (
        <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 16px" }} />
                {cols.map(({ t, d, busy }) => (
                  <th key={t} style={{ textAlign: "right", padding: "10px 16px", minWidth: 130 }}>
                    <Link href={`/marketstack?ticker=${t}`} style={{ textDecoration: "none", color: "inherit" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                        <CompanyLogo ticker={t} size={26} />
                        <span style={{ fontFamily: MONO, fontWeight: 700, color: "var(--accent-gold)" }}>{t}</span>
                      </div>
                    </Link>
                    <div style={{ fontSize: "0.6rem", fontWeight: 400, color: "var(--text-muted)", marginTop: 3 }}>
                      {busy ? "loading…" : d?.error ? `error: ${String(d.error).slice(0, 30)}` : (d?.profile?.name ?? "").slice(0, 22)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "8px 16px", fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {row.label}
                  </td>
                  {cols.map(({ t, d, busy }) => (
                    <td key={t} style={{ padding: "8px 16px", textAlign: "right", fontFamily: MONO, color: busy || d?.error ? "var(--text-muted)" : row.color?.(d) ?? "var(--text-primary)" }}>
                      {busy ? "…" : d?.error ? "—" : row.get(d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function MsComparePage() {
  return <Suspense fallback={null}><CompareInner /></Suspense>;
}
