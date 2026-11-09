"use client";
import { Suspense, useEffect, useState } from "react";
import CompanyLogo from "@/components/CompanyLogo";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import { ErrorNote, EmptyNote, SkeletonCards } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";

import { loadDirectory } from "@/lib/tickerDirectory";
import {
  xAxis, yAxis, grid, barCursor, dollars, ChartTip, changeNote, Delta, ChartCard, StatCell, useTimeframe,
} from "@/components/charts/kit";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

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

type Year = { year: number; total: number; change: number | null };

/** Dividends per share by year. Pointing at a year lights it and the year before, the pair the readout compares. */
function YearsPlot({ rows }: { rows: Year[] }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 6, right: 14, left: 0, bottom: 0 }} barCategoryGap="22%"
        onMouseMove={(st: any) => {
          const i = st?.isTooltipActive ? Number(st.activeTooltipIndex) : NaN;
          setHover(Number.isFinite(i) ? i : null);
        }}
        onMouseLeave={() => setHover(null)}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="year" {...xAxis} />
        <YAxis {...yAxis} tickFormatter={(v: number) => `$${v.toFixed(2)}`} width={52} />
        <Tooltip isAnimationActive={false} cursor={barCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
          content={<ChartTip build={(r: Year) => ({
            title: String(r.year), sub: "per share", rows: [{ value: `$${r.total.toFixed(4)}` }],
            notes: changeNote(`vs ${r.year - 1}`, r.change),
          })} />} />
        <Bar dataKey="total" fill="var(--series-1)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={r.year} fillOpacity={hover == null || i === hover || i === hover - 1 ? 1 : 0.3} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function DividendsInner() {
  const [ticker, setTicker] = useUrlTicker("KO");
  const { data, loading, stale, error, retry } = useTickerData<any>(ticker, (t) => `/api/marketstack-dividends/${t}`);

  const yearly: Year[] = (data?.yearly ?? [])
    .filter((y: any) => !y.partial)
    .map((y: any, i: number, all: any[]) => ({
      year: Number(y.year), total: Number(y.total),
      change: i > 0 && all[i - 1].total > 0 && Number(all[i - 1].year) === Number(y.year) - 1 ? (y.total - all[i - 1].total) / all[i - 1].total : null,
    }));
  const lastYear = yearly[yearly.length - 1];
  const frame = useTimeframe(yearly, (y) => `${y.year}-12-31`, { label: "Years shown", frames: ["5Y", "10Y", "20Y"] });
  // Growth over the last ten full years, or as many as there are.
  const base = yearly.length > 2 ? yearly[Math.max(0, yearly.length - 11)] : null;
  const span = base && lastYear ? lastYear.year - base.year : 0;
  const rate = base && lastYear && base.total > 0 && lastYear.total > 0 && span >= 2
    ? Math.pow(lastYear.total / base.total, 1 / span) - 1 : null;

  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => { loadDirectory().then((d) => setNames(new Map(d))); }, []);
  const company = data?.ticker ? names?.get(data.ticker) : undefined;

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
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <CompanyLogo ticker={data.ticker} size={44} fallback />
            <div style={{ minWidth: 0 }}>
              <h2 style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 10px", margin: 0 }}>
                <span style={{ fontFamily: SERIF, fontSize: "1.3rem", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{company ?? data.ticker}</span>
                {company && <span style={{ fontFamily: MONO, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>{data.ticker}</span>}
              </h2>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 3 }}>
                {data.count} payments on record since {String(data.oldest).slice(0, 4)}
              </div>
            </div>
          </div>

          <div className="stat-strip">
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 44vw), 1fr))" }}>
              <StatCell label="Paid, last 12 months" value={dollars(Number(data.ttm))} sub="per share" />
              <StatCell label="Yield" value={data.yieldPct != null ? `${data.yieldPct.toFixed(2)}%` : "n/a"}
                sub={data.price ? `at $${Number(data.price).toFixed(2)} a share` : undefined} />
              <StatCell label="Paid" value={data.freq === "q" ? "Quarterly" : data.freq === "m" ? "Monthly" : data.freq === "s" ? "Twice a year" : data.freq === "a" ? "Yearly" : data.freq ?? "n/a"} />
              <StatCell label="Growth streak" value={`${data.growthStreak} ${data.growthStreak === 1 ? "year" : "years"}`} sub="of raises in a row" />
              {data.upcoming?.length > 0
                ? <StatCell label="Next ex-dividend date" value={data.upcoming[0].date}
                    sub={`$${data.upcoming[0].amount}${data.upcoming[0].paymentDate ? `, paid ${data.upcoming[0].paymentDate}` : ""}`} />
                : data.projectedNext
                ? <StatCell label="Next ex-dividend date" value={`~${data.projectedNext.date}`}
                    sub={`Expected from its ${data.projectedNext.basis} pattern; not declared`} />
                : <StatCell label="Next ex-dividend date" value="Not declared" />}
            </div>
          </div>

          {yearly.length >= 2 && lastYear && (
            <div className="chart-grid" style={{ marginTop: 16 }}>
              <ChartCard title="Dividends per share, by year" wide ticker={data.ticker} company={company} control={frame.control}
                figure={dollars(lastYear.total)}
                delta={<Delta frac={lastYear.change} label={`vs ${lastYear.year - 1}`} />}
                caption={[`Paid in ${lastYear.year}`, rate != null ? `${rate >= 0 ? "Up" : "Down"} ${Math.abs(rate * 100).toFixed(1)}% a year over ${span} years` : null].filter(Boolean).join(" · ")}>
                <YearsPlot rows={frame.rows} />
              </ChartCard>
            </div>
          )}

          <h3 style={{ fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", padding: "1.8rem 0 0.5rem", margin: "0 0 0.9rem" }}>
            Recent payments
          </h3>
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO, whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-date</th>
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
