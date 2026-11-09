"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import Icon from "@/components/Icon";
import { ErrorNote, SkeletonCards } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";
import PriceChart from "@/components/PriceChart";
import TradingViewChart from "@/components/TradingViewChart";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";
import ChartModeToggle, { ChartMode } from "@/components/ChartModeToggle";

// ETF Hub. Holdings come from SEC N-PORT filings (via marketstack), so the
// portfolio is as-of a quarterly report date rather than live — that date is
// shown prominently instead of being implied to be current. Price, dividends
// and yield are live.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const PICKS = ["VOO", "IVV", "VTI", "QQQM", "SCHD", "ARKK"];

const money = (n: any) => (n == null || !isFinite(n) ? "—" : `$${Number(n).toFixed(2)}`);
const pct = (n: any, d = 2) => (n == null || !isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(d)}%`);
const big = (n: any) => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
  return `$${a.toFixed(0)}`;
};

function SectionLabel({ children, hint, right }: { children: React.ReactNode; hint?: string; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>
      {hint && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.6875rem" }}>{hint}</span>}
      {right && <span style={{ marginLeft: "auto", alignSelf: "center" }}>{right}</span>}
    </div>
  );
}

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

/** Horizontal weight bar used by the allocation blocks. */
function WeightBar({ label, pctValue, valueUsd }: { label: string; pctValue: number; valueUsd: number }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginBottom: 3 }}>
        <span style={{ fontFamily: SANS, color: "var(--text-primary)" }}>{label}</span>
        <span style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>
          {pctValue.toFixed(2)}% <span style={{ color: "var(--text-muted)" }}>· {big(valueUsd)}</span>
        </span>
      </div>
      <div style={{ height: 6, background: "var(--bg-elevated)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pctValue)}%`, height: "100%", background: "var(--accent-gold)", borderRadius: 999 }} />
      </div>
    </div>
  );
}

function EtfInner() {
  const [ticker, setTicker] = useUrlTicker("VOO");
  const { data, loading, stale, error, retry } = useTickerData<any>(ticker, (t) => `/api/etf/${t}`);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [chartMode, setChartMode] = useState<ChartMode>("builtin");
  // Full holdings are fetched on demand — a broad fund carries hundreds of rows
  // and the default view only needs 25.
  const [allHoldings, setAllHoldings] = useState<any[] | null>(null);
  const [allFor, setAllFor] = useState<string | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const q = data?.quote;
  const fund = data?.fund;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="ETF Hub"
        subtitle="What a fund holds, where, and what it costs: holdings, country and asset allocation, price and yield.">
        <TickerInput value={ticker} onSubmit={setTicker} loading={loading} action="Load"
          placeholder="Fund ticker" label="ETF ticker" suggest={false} />
      </PageHeader>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: "1.2rem" }}>
        <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginRight: 4 }}>Try</span>
        {PICKS.map((t) => (
          <button key={t} type="button" aria-pressed={ticker === t} onClick={() => setTicker(t)}
            style={{ background: ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)", color: ticker === t ? "var(--on-accent)" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 13px", fontFamily: MONO, fontSize: "0.74rem", fontWeight: 600, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {error && <ErrorNote title={`${ticker} didn't load`} message={lookupErrorText(error)} onRetry={retry} />}
      {loading && !data && (
        <div role="status" aria-label="Loading fund" style={{ display: "grid", gap: 14 }}>
          <div className="skeleton-bar" style={{ height: 300, borderRadius: 22 }} />
          <SkeletonCards count={5} minWidth={150} />
        </div>
      )}

      {data && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          {/* Header — price works for every ETF, holdings or not */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.4rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
              <CompanyLogo ticker={data.ticker} size={48} />
              <div>
                <h2 style={{ fontFamily: SERIF, fontSize: "clamp(1.2rem, 4.6vw, 1.5rem)", fontWeight: 600, margin: 0, letterSpacing: "-0.01em", lineHeight: 1.2, textWrap: "balance" }}>{q?.name ?? data.ticker}</h2>
                <div style={{ fontFamily: MONO, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 2 }}>
                  {data.ticker}{fund?.seriesName ? ` · ${fund.seriesName}` : ""}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: "2rem", fontWeight: 600 }}>{money(q?.price)}</span>
              {q?.changePct != null && (
                <span style={{ fontFamily: MONO, fontSize: "0.95rem", color: q.changePct >= 0 ? "var(--positive)" : "var(--negative)" }}>
                  {pct(q.changePct)}
                </span>
              )}
              {q?.date && <span style={{ fontSize: "0.76rem", color: "var(--text-secondary)" }}>as of {q.date}</span>}
            </div>
          </div>

          {/* Price chart + returns work for EVERY ETF, holdings or not */}
          {q?.chart?.length > 1 && (
            <>
              <SectionLabel
                hint="dividend-adjusted"
                right={
                  <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {/* TradingView ships its own timeframe controls */}
                    {chartMode === "builtin" && <RangeToggle range={range} onChange={setRange} />}
                    <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                  </div>
                }
              >Price</SectionLabel>
              {chartMode === "builtin"
                ? <PriceChart data={sliceRange(q.chart ?? [], range)} label={range} />
                : <TradingViewChart ticker={data.ticker} />}
            </>
          )}
          {q?.returns?.length > 0 && (
            <>
              <SectionLabel>Total Return</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10 }}>
                {q.returns.map((r: any) => (
                  <Stat key={r.years} label={`${r.years}-Year Return`} value={pct(r.totalPct, 0)}
                    sub={`${pct(r.cagrPct, 1)}/yr`} tone={r.totalPct >= 0 ? "good" : "bad"} />
                ))}
                {q.pos52 != null && (
                  <Stat label="52-Week Range" value={`${q.pos52.toFixed(0)}%`}
                    sub={`${money(q.week52Low)} – ${money(q.week52High)}`} />
                )}
              </div>
            </>
          )}

          {!data.holdingsAvailable ? (
            <div style={{ ...CARD, padding: "22px 24px", borderStyle: "dashed", marginTop: "1.4rem", maxWidth: 720 }}>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 8 }}>
                Holdings not published for {data.ticker}
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                {data.reason} Price, dividends and charts above and elsewhere on the site work normally for this ticker.
              </p>
              {data.suggestion && (
                <div style={{ marginTop: 14 }}>
                  <button type="button" onClick={() => setTicker(data.suggestion)} style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    background: "var(--accent-gold)", color: "var(--on-accent)", border: "none",
                    borderRadius: 999, padding: "9px 18px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
                  }}>
                    View {data.suggestion} instead: same index, holdings published <Icon name="arrow-right" size={14} strokeWidth={2.2} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <SectionLabel hint={`as filed ${fund?.reportDate ?? "—"}`}>Fund Facts</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10 }}>
                <Stat label="Net Assets" value={big(data.totals?.netAssets)} sub="per latest N-PORT filing" />
                <Stat label="Holdings" value={String(data.totals?.count ?? "—")} sub="positions reported" />
                <Stat label="Dividend Yield" value={q?.yieldPct != null ? `${q.yieldPct.toFixed(2)}%` : "—"}
                  sub={q?.ttmDividend ? `$${q.ttmDividend.toFixed(2)} TTM · ${q.payoutsPerYear ?? "?"}×/yr` : undefined} tone="good" />
                <Stat label="Expense Ratio" value={q?.expenseRatio != null ? `${q.expenseRatio.toFixed(2)}%` : "—"}
                  sub={q?.expenseRatio != null ? `$${(q.expenseRatio * 100).toFixed(0)}/yr per $10k` : "not in reference table"}
                  tone={q?.expenseRatio != null && q.expenseRatio <= 0.1 ? "good" : q?.expenseRatio != null && q.expenseRatio > 0.4 ? "bad" : undefined} />
                <Stat label="Top 10 Weight" value={`${(data.totals?.top10Weight ?? 0).toFixed(1)}%`}
                  sub="concentration in largest names" />
                <Stat label="Effective Holdings" value={data.totals?.effectiveHoldings != null ? String(Math.round(data.totals.effectiveHoldings)) : "—"}
                  sub="equal-weight equivalent (1/Σw²)" />
              </div>
              <div style={{ height: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 44vw), 1fr))", gap: 10 }}>
                <Stat label="Largest Position" value={data.totals?.largestWeight != null ? `${data.totals.largestWeight.toFixed(2)}%` : "—"}
                  sub={data.totals?.largestName ?? undefined} />
                <Stat label="Securities on Loan" value={data.totals?.onLoanPct != null ? `${data.totals.onLoanPct.toFixed(2)}%` : "—"}
                  sub="lent out for income" />
                {data.totals?.shortPct > 0 && (
                  <Stat label="Short Exposure" value={`${data.totals.shortPct.toFixed(1)}%`} sub="short positions" tone="bad" />
                )}
                {data.fairValue?.[0] && (
                  <Stat label="Priced at Market (L1)"
                    value={`${(data.fairValue.find((f: any) => f.key === "Level 1")?.weightPct ?? 0).toFixed(1)}%`}
                    sub="quoted prices vs modelled" tone="good" />
                )}
                <Stat label="Report Date" value={fund?.reportDate ?? "—"} sub="SEC N-PORT as-of" />
              </div>

              <div style={{
                ...CARD, padding: "12px 16px", marginTop: 12, borderStyle: "dashed",
                fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.55,
              }}>
                Holdings are a point-in-time snapshot from the fund&apos;s SEC N-PORT filing dated{" "}
                <strong style={{ color: "var(--text-secondary)" }}>{fund?.reportDate}</strong> — not live. Funds file
                quarterly and the public release lags, so an index fund&apos;s composition will still be broadly
                accurate while an actively-managed fund may have moved on. Price and yield above are current.
              </div>

              {(() => {
                const showingAll = allFor === data.ticker && allHoldings;
                const rows = showingAll ? allHoldings! : data.top;
                return (
              <>
              <SectionLabel hint={`${data.totals?.count} positions · showing ${showingAll ? `all ${rows.length}` : `largest ${data.top.length}`}`}>Top Holdings</SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: "left", padding: "9px 10px", fontWeight: 600 }}>Holding</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Weight</th>
                      <th style={{ textAlign: "right", padding: "9px 10px", fontWeight: 600 }}>Market Value</th>
                      <th style={{ textAlign: "left", padding: "9px 14px", fontWeight: 600, minWidth: 110 }}>Share of Fund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((h: any, i: number) => (
                      <tr key={`${h.cusip ?? h.name}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px 14px", fontFamily: MONO, color: "var(--text-muted)" }}>{i + 1}</td>
                        <td style={{ padding: "8px 10px", fontWeight: 600 }}>{h.name}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: "var(--accent-gold)", fontWeight: 700 }}>
                          {h.weightPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO, color: "var(--text-secondary)" }}>{big(h.valueUsd)}</td>
                        <td style={{ padding: "8px 14px" }}>
                          <div style={{ height: 5, background: "var(--bg-elevated)", borderRadius: 999, overflow: "hidden", minWidth: 90 }}>
                            <div style={{
                              width: `${Math.min(100, (h.weightPct / (rows[0]?.weightPct || 1)) * 100)}%`,
                              height: "100%", background: "var(--accent-gold)", borderRadius: 999,
                            }} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.totals?.count > data.top.length && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                  <button
                    type="button"
                    disabled={loadingAll}
                    onClick={async () => {
                      if (showingAll) { setAllHoldings(null); setAllFor(null); return; }
                      setLoadingAll(true);
                      try {
                        const res = await fetch(`/api/etf/${data.ticker}?all=1`);
                        const json = await res.json();
                        if (Array.isArray(json?.all)) { setAllHoldings(json.all); setAllFor(data.ticker); }
                      } catch { /* leave the top-25 view in place */ }
                      finally { setLoadingAll(false); }
                    }}
                    style={{
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      color: "var(--text-secondary)", borderRadius: 999, padding: "9px 22px",
                      fontFamily: SANS, fontSize: "0.78rem", fontWeight: 600,
                      cursor: loadingAll ? "wait" : "pointer", opacity: loadingAll ? 0.6 : 1,
                      display: "inline-flex", alignItems: "center", gap: 8,
                    }}
                  >
                    {loadingAll && <span className="spinner" style={{ width: 12, height: 12 }} />}
                    {loadingAll ? "Loading holdings" : showingAll ? "Show top 25" : `See all ${data.totals.count} holdings`}
                  </button>
                </div>
              )}
              </>
                );
              })()}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 92vw), 1fr))", gap: 14 }}>
                <div>
                  <SectionLabel>Country Allocation</SectionLabel>
                  <div style={{ ...CARD, padding: "16px 18px" }}>
                    {data.countries.map((c: any) => (
                      <WeightBar key={c.key} label={c.key} pctValue={c.weightPct} valueUsd={c.valueUsd} />
                    ))}
                  </div>
                </div>
                <div>
                  <SectionLabel>Asset Type</SectionLabel>
                  <div style={{ ...CARD, padding: "16px 18px" }}>
                    {data.categories.map((c: any) => (
                      <WeightBar key={c.key} label={c.key} pctValue={c.weightPct} valueUsd={c.valueUsd} />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "1.4rem", lineHeight: 1.6 }}>
                Holdings, allocation and net assets from SEC N-PORT
                {fund?.cik ? ` (CIK ${Number(fund.cik)}, file ${fund.fileNumber})` : ""}. Price, dividends and yield
                from licensed market data.{" "}
                <Link href={`/research?ticker=${data.ticker}`} style={{ color: "var(--accent-gold)", whiteSpace: "nowrap" }}>
                  Full price research for {data.ticker} <Icon name="arrow-right" size={12} />
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function EtfPage() {
  return <Suspense fallback={null}><EtfInner /></Suspense>;
}
