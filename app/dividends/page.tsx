"use client";
import { Suspense } from "react";
import CompanyLogo from "@/components/CompanyLogo";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import { ErrorNote, EmptyNote, SkeletonCards } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";

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
      <div style={{ fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function DividendsInner() {
  const [ticker, setTicker] = useUrlTicker("KO");
  const { data, loading, stale, error, retry } = useTickerData<any>(ticker, (t) => `/api/marketstack-dividends/${t}`);

  const yearly = (data?.yearly ?? []).filter((y: any) => !y.partial);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Dividends"
        subtitle="The complete payout record since listing, with yield, growth streak and the next ex-dividend date.">
        <TickerInput value={ticker} onSubmit={setTicker} loading={loading} action="Search" />
      </PageHeader>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: "1.4rem" }}>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginRight: 4 }}>Try</span>
        {PICKS.map((t) => (
          <button key={t} type="button" aria-pressed={ticker === t} onClick={() => setTicker(t)}
            style={{ background: ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)", color: ticker === t ? "var(--on-accent)" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 13px", fontFamily: MONO, fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {error && <ErrorNote title={`${ticker} didn't load`} message={lookupErrorText(error)} onRetry={retry} />}
      {loading && !data && <SkeletonCards count={5} minWidth={150} />}
      {data && !stale && data.count === 0 && (
        <EmptyNote title={`${data.ticker} has never paid a dividend`}>
          No payments are on record for this company. Many growth companies keep their cash to reinvest; try one of the names above to see a full payout history.
        </EmptyNote>
      )}

      {data && data.count > 0 && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem", flexWrap: "wrap" }}>
            <CompanyLogo ticker={data.ticker} size={40} />
            <h2 style={{ fontFamily: SERIF, fontSize: "1.3rem", fontWeight: 600, margin: 0 }}>{data.ticker}</h2>
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
              <div style={{ fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "1.4rem 0 0.5rem", marginBottom: "0.9rem" }}>
                Dividends Per Share, By Year
              </div>
              <div style={{ ...CARD, padding: "18px 10px 6px", height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yearly} margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                    <XAxis dataKey="year" tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: MONO }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
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

          <div style={{ fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "1.6rem 0 0.5rem", marginBottom: "0.9rem" }}>
        Recent Payments
          </div>
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
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
        </div>
      )}
    </div>
  );
}

export default function MsDividendsPage() {
  return <Suspense fallback={null}><DividendsInner /></Suspense>;
}
