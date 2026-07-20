"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PriceChart from "@/components/PriceChart";
import RangeToggle, { RangeKey, sliceRange } from "@/components/RangeToggle";

// ── formatting ───────────────────────────────────────────────────────────────
const bigMoney = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
const bigNum = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString();
};
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const POPULAR = ["SPY", "VOO", "QQQ", "VTI", "SCHD", "IWM", "DIA", "GLD", "XLK", "JEPI"];

// ── shared UI bits ───────────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
      fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
      margin: "1.9rem 0 0.9rem",
    }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

function Fact({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.25rem", fontWeight: 600,
        color: tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)",
      }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// Horizontal allocation bar list (sectors / countries)
function AllocBars({ rows, color }: { rows: { label: string; weight: number }[]; color: string }) {
  const max = rows.length ? rows[0].weight : 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", color: "var(--text-primary)" }}>{r.label}</span>
            <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.72rem", color: "var(--text-secondary)" }}>{r.weight.toFixed(1)}%</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(1.5, (r.weight / max) * 100)}%`, height: "100%", borderRadius: 999, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyHint({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: "1.1rem" }}>
      <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>{title}</div>
      <div style={{ border: "1px dashed var(--border-active)", borderRadius: 22, background: "var(--bg-surface)", padding: "30px 20px", textAlign: "center" }}>
        <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)" }}>{desc}</span>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────
function EtfInner() {
  const searchParams = useSearchParams();
  const [input, setInput] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("1Y");
  const [showAllHoldings, setShowAllHoldings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load(sym: string) {
    const t = sym.trim().toUpperCase();
    if (!t) return;
    setLoading(true); setError(null); setData(null); setShowAllHoldings(false);
    try {
      const res = await fetch(`/api/etf/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message === "Not found — is this an ETF ticker?" ? e.message : "Could not load ETF data. Check the ticker and try again.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInput(t.toUpperCase()); load(t.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Type-to-search: fresh typing anywhere replaces the prior ticker
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement)?.isContentEditable) return;
      if (/^[a-zA-Z0-9.]$/.test(e.key)) {
        const box = inputRef.current;
        if (!box) return;
        e.preventDefault();
        setInput(e.key.toUpperCase());
        box.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const info = data?.info;
  const quote = data?.quote;
  const holdings: any[] = data?.holdings ?? [];
  const sectors: any[] = data?.sectors ?? [];
  const countries: any[] = data?.countries ?? [];
  const prices: { date: string; price: number }[] = data?.prices ?? [];
  const dividends: any[] = data?.dividends ?? [];

  const top10Weight = holdings.slice(0, 10).reduce((s, h) => s + (h.weight ?? 0), 0);
  const shownHoldings = showAllHoldings ? holdings : holdings.slice(0, 15);
  const maxWeight = holdings.length ? holdings[0].weight : 1;
  const ttmYield = data?.ttmDividend && quote?.price ? (data.ttmDividend / quote.price) * 100 : null;
  const navPremium = quote?.price && info?.nav ? ((quote.price - info.nav) / info.nav) * 100 : null;
  const ageYears = info?.inceptionDate ? (Date.now() - new Date(info.inceptionDate).getTime()) / (365.25 * 86400000) : null;
  const up = (quote?.changePct ?? 0) >= 0;

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "4rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        ETF Hub
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Holdings, allocations, costs, and distributions for any ETF — start typing a ticker anywhere.
      </div>

      {/* Search + quick picks */}
      <form onSubmit={(e) => { e.preventDefault(); load(input); inputRef.current?.blur(); }}
        style={{ display: "flex", gap: 10, marginBottom: "0.8rem", maxWidth: 380 }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Type a ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading} style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Analyze"}
        </button>
      </form>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.6rem" }}>
        {POPULAR.map((t) => (
          <button key={t} type="button" onClick={() => { setInput(t); load(t); }} style={{
            background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)",
            color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)",
            border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px",
            fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.7rem", cursor: "pointer",
          }}>{t}</button>
        ))}
      </div>

      {error && <p style={{ color: "var(--negative)", fontSize: "0.85rem", marginBottom: "1rem" }}>{error}</p>}

      {/* Empty state */}
      {!data && !loading && !error && (
        <div>
          <EmptyHint title="Fund Overview" desc="Price, expense ratio, AUM, NAV premium, yield, and fund age at a glance." />
          <EmptyHint title="Top Holdings" desc="Every position with weight bars — see exactly what you own and how concentrated it is." />
          <EmptyHint title="Sector & Country Allocation" desc="Where the fund's money actually sits, by industry and geography." />
          <EmptyHint title="Distributions" desc="Trailing yield and the recent payout history." />
        </div>
      )}

      {data && (
        <>
          {/* ── Fund identity ── */}
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
            <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.3rem", fontWeight: 700, color: "var(--accent-gold)" }}>{data.ticker}</span>
            <span style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.35rem", fontWeight: 600 }}>{info?.name ?? quote?.name ?? ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: "0.8rem" }}>
            {[info?.etfCompany, info?.assetClass, info?.domicile ? `Domicile: ${info.domicile}` : null].filter(Boolean).map((b: any) => (
              <span key={b} style={{ background: "rgba(var(--accent-rgb), 0.12)", border: "1px solid rgba(var(--accent-rgb), 0.3)", borderRadius: 24, padding: "2px 10px", fontSize: "0.68rem", color: "var(--accent-gold)" }}>{b}</span>
            ))}
          </div>
          {quote?.price != null && (
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.9rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
              <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "2.1rem", fontWeight: 700 }}>
                ${quote.price.toFixed(2)}
              </span>
              {quote.change != null && (
                <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1rem", fontWeight: 600, color: up ? "var(--positive)" : "var(--negative)" }}>
                  {up ? "▲" : "▼"} {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct >= 0 ? "+" : ""}{(quote.changePct ?? 0).toFixed(2)}%)
                </span>
              )}
              {quote.yearLow != null && quote.yearHigh != null && (
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  52-wk range <span style={{ fontFamily: "'Spline Sans Mono', monospace" }}>${quote.yearLow.toFixed(2)} – ${quote.yearHigh.toFixed(2)}</span>
                </span>
              )}
            </div>
          )}

          {/* ── Fact cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 44vw), 1fr))", gap: 10, marginTop: "1rem" }}>
            <Fact label="Expense Ratio" value={info?.expenseRatio != null ? `${info.expenseRatio.toFixed(2)}%` : "—"}
              sub={info?.expenseRatio != null ? `$${(info.expenseRatio * 100).toFixed(0)} / yr per $10K invested` : undefined}
              tone={info?.expenseRatio != null ? (info.expenseRatio <= 0.15 ? "good" : info.expenseRatio >= 0.75 ? "bad" : undefined) : undefined} />
            <Fact label="Assets Under Mgmt" value={bigMoney(info?.aum)} sub={info?.avgVolume ? `${bigNum(info.avgVolume)} avg daily volume` : undefined} />
            <Fact label="NAV" value={info?.nav != null ? `$${info.nav.toFixed(2)}` : "—"}
              sub={navPremium != null ? `price ${navPremium >= 0 ? "+" : ""}${navPremium.toFixed(2)}% vs NAV` : undefined} />
            <Fact label="Holdings" value={info?.holdingsCount != null ? String(info.holdingsCount) : holdings.length ? String(holdings.length) : "—"}
              sub={top10Weight > 0 ? `top 10 = ${top10Weight.toFixed(1)}% of fund` : undefined} />
            <Fact label="Dividend Yield" value={ttmYield != null ? `${ttmYield.toFixed(2)}%` : "—"}
              sub={data?.ttmDividend ? `$${data.ttmDividend.toFixed(2)} / share trailing 12 mo` : "no distributions"} />
            <Fact label="Inception" value={info?.inceptionDate ? fmtDate(info.inceptionDate) : "—"}
              sub={ageYears != null ? `${ageYears.toFixed(0)} years old` : undefined} />
          </div>

          {/* ── Price chart ── */}
          <SectionLabel right={<RangeToggle range={range} onChange={setRange} />}>Price</SectionLabel>
          {prices.length > 1 && (
            <PriceChart data={sliceRange<{ date: string; price: number }>(prices, range)} label={range} />
          )}

          {/* ── Holdings + allocations ── */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Holdings table */}
            <div style={{ flex: "1.5 1 420px", minWidth: 0 }}>
              <SectionLabel>Top Holdings{info?.holdingsCount ? ` — ${info.holdingsCount} positions` : ""}</SectionLabel>
              {holdings.length > 0 ? (
                <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text-secondary)", fontFamily: "'Public Sans', sans-serif", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>#</th>
                        <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 600 }}>Symbol</th>
                        <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 600 }}>Name</th>
                        <th style={{ textAlign: "right", padding: "8px 6px", fontWeight: 600 }}>Weight</th>
                        <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 600, minWidth: 90 }}></th>
                        <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shownHoldings.map((h, i) => (
                        <tr key={`${h.asset}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 14px", color: "var(--text-muted)", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.7rem" }}>{i + 1}</td>
                          <td style={{ padding: "8px 6px" }}>
                            <Link href={`/research?ticker=${encodeURIComponent(h.asset)}`} style={{ color: "var(--accent-gold)", textDecoration: "none", fontFamily: "'Spline Sans Mono', monospace", fontWeight: 600 }}>
                              {h.asset}
                            </Link>
                          </td>
                          <td style={{ padding: "8px 6px", color: "var(--text-secondary)", maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right", fontFamily: "'Spline Sans Mono', monospace" }}>{h.weight.toFixed(2)}%</td>
                          <td style={{ padding: "8px 6px" }}>
                            <div style={{ height: 6, borderRadius: 999, background: "var(--bg-elevated)", overflow: "hidden" }}>
                              <div style={{ width: `${Math.max(2, (h.weight / maxWeight) * 100)}%`, height: "100%", borderRadius: 999, background: "var(--accent-gold)" }} />
                            </div>
                          </td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Spline Sans Mono', monospace", color: "var(--text-secondary)" }}>{bigMoney(h.marketValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {holdings.length > 15 && (
                    <div style={{ padding: "10px 14px 8px", textAlign: "center" }}>
                      <button type="button" onClick={() => setShowAllHoldings(s => !s)} style={{
                        background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)",
                        borderRadius: 999, padding: "6px 16px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.68rem", fontWeight: 600, cursor: "pointer",
                      }}>
                        {showAllHoldings ? "Show top 15" : `Show top ${holdings.length}`}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", padding: "10px 0" }}>No holdings data for this fund.</div>
              )}
              {holdings.length > 0 && (
                <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 6, padding: "0 4px" }}>
                  Weights update with disclosures — click any symbol to open it in Stock Research. Showing the largest {shownHoldings.length} of {info?.holdingsCount ?? holdings.length}.
                </div>
              )}
            </div>

            {/* Allocations */}
            <div style={{ flex: "1 1 300px", minWidth: 0 }}>
              {sectors.length > 0 && (
                <>
                  <SectionLabel>Sector Allocation</SectionLabel>
                  <div style={{ ...CARD, padding: "16px 18px" }}>
                    <AllocBars rows={sectors.slice(0, 11).map((s) => ({ label: s.sector, weight: s.weight }))} color="var(--accent-gold)" />
                  </div>
                </>
              )}
              {countries.length > 0 && (
                <>
                  <SectionLabel>Country Allocation</SectionLabel>
                  <div style={{ ...CARD, padding: "16px 18px" }}>
                    <AllocBars rows={countries.slice(0, 8).map((c) => ({ label: c.country, weight: c.weight }))} color="var(--accent-2)" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Distributions ── */}
          {dividends.length > 0 && (
            <>
              <SectionLabel>Distributions</SectionLabel>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" }}>
                <div style={{ ...CARD, padding: "16px 18px", flex: "0 1 260px" }}>
                  <div style={{ fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 6 }}>Trailing 12-Mo Yield</div>
                  <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.7rem", fontWeight: 700, color: "var(--positive)" }}>
                    {ttmYield != null ? `${ttmYield.toFixed(2)}%` : "—"}
                  </div>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 4 }}>
                    {data?.ttmDividend ? `$${data.ttmDividend.toFixed(2)} per share` : ""}{dividends[0]?.frequency ? ` · paid ${String(dividends[0].frequency).toLowerCase()}` : ""}
                  </div>
                </div>
                <div style={{ ...CARD, padding: "6px 0", flex: "1 1 340px", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text-secondary)", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                        <th style={{ textAlign: "left", padding: "8px 6px", fontWeight: 600 }}>Pay Date</th>
                        <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dividends.slice(0, 6).map((d, i) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 14px" }}>{fmtDate(d.date)}</td>
                          <td style={{ padding: "8px 6px", color: "var(--text-secondary)" }}>{fmtDate(d.paymentDate)}</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: "'Spline Sans Mono', monospace" }}>${Number(d.amount).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ── About ── */}
          {info?.description && (
            <>
              <SectionLabel>About This Fund</SectionLabel>
              <div style={{ ...CARD, padding: "18px 20px" }}>
                <p style={{ margin: 0, fontSize: "0.82rem", lineHeight: 1.75, color: "var(--text-secondary)" }}>{info.description}</p>
                {info.website && (
                  <a href={info.website} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 12, fontSize: "0.7rem", color: "var(--accent-gold)" }}>
                    Fund page ↗
                  </a>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function EtfPage() {
  return <Suspense fallback={null}><EtfInner /></Suspense>;
}
