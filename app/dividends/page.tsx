"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CompanyLogo from "@/components/CompanyLogo";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// Dividends, Market Stack edition — the one dataset where marketstack outshines
// the paid tiers of most rivals: full history, upcoming declared payments,
// declaration/record/payment dates.
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const PICKS = ["KO", "JNJ", "AAPL", "MSFT", "O"];

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function DividendsInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "KO");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  async function load(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t); setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/marketstack-dividends/${t}`);
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
    load(search.get("ticker") ?? "KO");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearly = (data?.yearly ?? []).filter((y: any) => !y.partial);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Dividends
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Complete payout record with annual growth — marketstack keeps full history at every tier.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 360, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Search"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.4rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => load(t)}
            style={{ background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)", color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px", fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</p>}
      {data && !loading && data.count === 0 && (
        <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          {data.ticker} has no dividend history on record.
        </div>
      )}

      {data && !loading && data.count > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
            <CompanyLogo ticker={data.ticker} size={40} />
            <span style={{ fontFamily: SERIF, fontSize: "1.3rem", fontWeight: 600 }}>{data.ticker}</span>
            <span style={{ fontFamily: MONO, fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {data.count} payments since {String(data.oldest).slice(0, 4)}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10, marginBottom: "0.6rem" }}>
            <Stat label="TTM Dividends" value={`$${Number(data.ttm).toFixed(2)}`} />
            <Stat label="Yield" value={data.yieldPct != null ? `${data.yieldPct.toFixed(2)}%` : "—"} sub={data.price ? `at $${Number(data.price).toFixed(2)}` : undefined} tone="good" />
            <Stat label="Frequency" value={data.freq === "q" ? "Quarterly" : data.freq === "m" ? "Monthly" : data.freq === "s" ? "Semi-Annual" : data.freq ?? "—"} />
            <Stat label="Growth Streak" value={`${data.growthStreak} yrs`} sub="consecutive annual raises" tone={data.growthStreak >= 5 ? "good" : undefined} />
            {data.upcoming?.length > 0
              ? <Stat label="Next Ex-Date" value={data.upcoming[0].date} sub={`$${data.upcoming[0].amount}${data.upcoming[0].paymentDate ? ` · pays ${data.upcoming[0].paymentDate}` : ""}`} tone="good" />
              : data.projectedNext
              ? <Stat label="Next Ex-Date" value={`~ ${data.projectedNext.date}`}
                  sub={`expected · ${data.projectedNext.basis} cadence, not yet declared`} />
              : <Stat label="Next Ex-Date" value="Not declared" />}
          </div>

          {yearly.length >= 2 && (
            <>
              <div style={{ fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "1.4rem 0 0.5rem", marginBottom: "0.9rem" }}>
                Dividends Per Share, By Year
              </div>
              <div style={{ ...CARD, padding: "18px 10px 6px", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearly} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: MONO }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={56} />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, fontFamily: MONO, fontSize: 12 }}
                      formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "per share"]}
                    />
                    <Bar dataKey="total" radius={[5, 5, 0, 0]}>
                      {yearly.map((_: any, i: number) => (
                        <Cell key={i} fill="var(--accent-gold)" fillOpacity={0.5 + 0.5 * (i / Math.max(1, yearly.length - 1))} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          <div style={{ fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "1.6rem 0 0.5rem", marginBottom: "0.9rem" }}>
        Recent Payments
          </div>
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                  <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Declared</th>
                  <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((d: any) => (
                  <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 14px", color: "var(--text-secondary)" }}>{d.date}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>${Number(d.amount).toFixed(4)}</td>
                    <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--text-muted)" }}>{d.declarationDate ?? "—"}</td>
                    <td style={{ padding: "6px 14px", textAlign: "right", color: "var(--text-muted)" }}>{d.paymentDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function MsDividendsPage() {
  return <Suspense fallback={null}><DividendsInner /></Suspense>;
}
