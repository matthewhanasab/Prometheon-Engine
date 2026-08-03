"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import CompanyLogo from "@/components/CompanyLogo";
import TradingViewChart from "@/components/TradingViewChart";

// Stock Research, rebuilt on marketstack data end-to-end. Same visual language
// as /research, but every number here comes from the marketstack Business plan
// (plus TradingView's own widget for the interactive chart).

const MONO = "'Spline Sans Mono', monospace";
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

const PICKS = ["AAPL", "NVDA", "MSFT", "KO", "SPY", "IREN"];

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "N/A" : `$${fmt(n)}`);
const pct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "N/A" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
const compact = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "N/A"
    : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n));

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

function MCard({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string; tone?: "good" | "bad" | "neutral" | "default";
}) {
  const color = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : "var(--text-primary)";
  return (
    <div style={{ ...CARD, padding: "14px 16px" }}>
      <div style={{ fontFamily: SANS, fontSize: "0.55rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.15rem", fontWeight: 600, color }}>{value}</div>
      {sub && <div style={{ fontFamily: SANS, fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function Grid({ cols = 5, children }: { cols?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(min(150px, 44vw), 1fr))`, gap: 10 }}>
      {children}
    </div>
  );
}

function ratingTone(r: string | null): string {
  if (!r) return "var(--text-secondary)";
  const s = r.toLowerCase();
  if (s.includes("buy") || s.includes("outperform") || s.includes("overweight")) return "var(--positive)";
  if (s.includes("sell") || s.includes("underperform") || s.includes("underweight")) return "var(--negative)";
  return "var(--accent-gold)";
}

function MarketstackResearchInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

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
      setError(e?.message ?? "Failed to fetch"); setData(null);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    const t = search.get("ticker");
    if (t) load(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = data?.quote;
  const prof = data?.profile;
  const cons = data?.consensus;
  const div = data?.dividends;

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Market Stack Research
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        The research page, rebuilt on <strong>marketstack</strong> data — 15-year history, live IEX quotes,
        analyst ratings, SEC filings, full dividend record.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Type a ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" disabled={loading}
          style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Loading…" : "Analyze"}
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.2rem" }}>
        {PICKS.map((t) => (
          <button key={t} type="button" onClick={() => load(t)}
            style={{
              background: data?.ticker === t ? "var(--accent-gold)" : "var(--bg-elevated)",
              color: data?.ticker === t ? "var(--on-accent)" : "var(--text-secondary)",
              border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px",
              fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer",
            }}>{t}</button>
        ))}
      </div>

      {loading && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "30px 0" }}>Loading {input}…</div>}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {data && q && !loading && (
        <>
          {/* ── Company Header ── */}
          <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1.5rem", marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
              <CompanyLogo ticker={data.ticker} size={58} />
              <div style={{ fontFamily: SERIF, fontSize: "2rem", fontWeight: 500 }}>{prof?.name ?? data.ticker}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {[data.ticker, prof?.exchange, prof?.sector, prof?.industry].filter(Boolean).map((v: string) => (
                <span key={v} style={{ fontSize: "0.6rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>{v}</span>
              ))}
              {data.meta?.cik && (
                <span style={{ fontSize: "0.6rem", fontWeight: 500, letterSpacing: "0.08em", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", fontFamily: MONO }}>
                  CIK {Number(data.meta.cik)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontFamily: MONO, fontSize: "2.4rem", fontWeight: 600, letterSpacing: "-0.02em" }}>{money(q.price)}</span>
              <span style={{ fontFamily: MONO, fontSize: "1rem", fontWeight: 500, color: (q.change ?? 0) >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {(q.change ?? 0) >= 0 ? "▲" : "▼"} ${Math.abs(q.change ?? 0).toFixed(2)} ({pct(q.changePct)})
              </span>
              <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>as of {q.date}</span>
            </div>
            {data.intraday?.last != null && (
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontFamily: MONO, fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent-gold)", fontWeight: 700, fontFamily: SANS, fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.1em", alignSelf: "center" }}>Live · IEX</span>
                <span>last {money(data.intraday.last)}</span>
                {data.intraday.bid != null && <span>bid {money(data.intraday.bid)}{data.intraday.bidSize ? ` ×${data.intraday.bidSize}` : ""}</span>}
                {data.intraday.ask != null && <span>ask {money(data.intraday.ask)}{data.intraday.askSize ? ` ×${data.intraday.askSize}` : ""}</span>}
                {data.intraday.time && <span style={{ color: "var(--text-muted)" }}>{data.intraday.time} UTC</span>}
              </div>
            )}
          </div>

          {/* ── Price Chart (TradingView) ── */}
          <SectionLabel>Price Chart — TradingView</SectionLabel>
          <TradingViewChart ticker={data.ticker} />

          {/* ── Quick Stats ── */}
          <SectionLabel>Quick Stats</SectionLabel>
          <Grid cols={5}>
            <MCard label="52-Wk High" value={money(q.week52High)} />
            <MCard label="52-Wk Low" value={money(q.week52Low)} />
            <MCard label="52-Wk Position" value={q.pos52 != null ? `${q.pos52.toFixed(0)}%` : "N/A"}
              sub={q.pos52 != null ? (q.pos52 > 70 ? "Near 52-wk high" : q.pos52 < 30 ? "Near 52-wk low" : "Mid-range") : undefined} />
            <MCard label="Avg Volume" value={compact(q.avgVol)} sub="1-year daily average" />
            <MCard label="Analyst Target" value={cons?.avgTarget != null ? money(cons.avgTarget) : "N/A"}
              sub={cons?.avgTarget != null && q.price ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} vs price` : undefined}
              tone={cons?.avgTarget != null && cons.avgTarget > q.price ? "good" : "default"} />
          </Grid>

          {/* ── Long-Term Performance ── */}
          <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>the 15-year history entitlement, live</span>}>
            Long-Term Performance
          </SectionLabel>
          <Grid cols={5}>
            {data.longReturns?.map((r: any) =>
              r.available ? (
                <MCard key={r.years} label={`${r.years}-Year Return`} value={pct(r.totalPct, 0)}
                  sub={`${pct(r.cagrPct, 1)}/yr · from ${money(r.fromPrice)} (${String(r.fromDate).slice(0, 4)})`}
                  tone={r.totalPct >= 0 ? "good" : "bad"} />
              ) : (
                <MCard key={r.years} label={`${r.years}-Year Return`} value="—" sub="not listed that long" />
              )
            )}
          </Grid>

          {/* ── Analyst Ratings ── */}
          {cons && (
            <>
              <SectionLabel right={cons.asOf ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>as of {cons.asOf}</span> : undefined}>
                Analyst Ratings — {cons.analysts ?? "?"} Analysts
              </SectionLabel>
              <Grid cols={5}>
                <MCard label="Avg Target" value={money(cons.avgTarget)}
                  sub={q.price && cons.avgTarget != null ? `${pct(((cons.avgTarget - q.price) / q.price) * 100, 1)} implied` : undefined}
                  tone={cons.avgTarget != null && cons.avgTarget > q.price ? "good" : "bad"} />
                <MCard label="High Target" value={money(cons.highTarget)} tone="good" />
                <MCard label="Low Target" value={money(cons.lowTarget)} tone="bad" />
                <MCard label="Buy / Hold / Sell" value={`${cons.buy} / ${cons.hold} / ${cons.sell}`} />
                <MCard label="Consensus" value={
                  cons.buy + cons.hold + cons.sell > 0
                    ? cons.buy / (cons.buy + cons.hold + cons.sell) > 0.6 ? "Buy" : cons.sell > cons.buy ? "Sell" : "Hold"
                    : "N/A"
                } tone={cons.buy > cons.hold + cons.sell ? "good" : "neutral"} />
              </Grid>

              {/* buy/hold/sell bar */}
              {cons.buy + cons.hold + cons.sell > 0 && (
                <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginTop: 10, border: "1px solid var(--border)" }}>
                  <div style={{ width: `${(cons.buy / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--positive)" }} />
                  <div style={{ width: `${(cons.hold / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--accent-gold)" }} />
                  <div style={{ width: `${(cons.sell / (cons.buy + cons.hold + cons.sell)) * 100}%`, background: "var(--negative)" }} />
                </div>
              )}

              {data.analysts?.length > 0 && (
                <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 380, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                    <thead>
                      <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Analyst</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Firm</th>
                        <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Rating</th>
                        <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Target</th>
                        <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.analysts.map((a: any, i: number) => (
                        <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "7px 14px", fontWeight: 600 }}>{a.name}</td>
                          <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{a.firm}</td>
                          <td style={{ padding: "7px 10px", color: ratingTone(a.rating), fontWeight: 600 }}>
                            {a.rating ?? "—"}{a.action ? <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.66rem" }}> · {a.action}</span> : null}
                          </td>
                          <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: MONO }}>{a.target != null ? money(a.target) : "—"}</td>
                          <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{a.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ── Dividends ── */}
          <SectionLabel right={div?.count ? <span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>{div.count} records since {div.oldest}</span> : undefined}>
            Dividends
          </SectionLabel>
          {div?.count > 0 ? (
            <>
              <Grid cols={5}>
                <MCard label="TTM Dividends" value={money(div.ttmTotal)} />
                <MCard label="Yield" value={div.yieldPct != null ? `${div.yieldPct.toFixed(2)}%` : "N/A"} tone="good" />
                <MCard label="Frequency" value={div.freq === "q" ? "Quarterly" : div.freq === "m" ? "Monthly" : div.freq === "s" ? "Semi-Annual" : div.freq ?? "N/A"} />
                {div.upcoming?.length > 0
                  ? <MCard label="Next Ex-Date" value={div.upcoming[0].date} sub={`${money(div.upcoming[0].amount)}${div.upcoming[0].paymentDate ? ` · pays ${div.upcoming[0].paymentDate}` : ""}`} tone="good" />
                  : <MCard label="Next Ex-Date" value="Not declared" />}
                <MCard label="History Depth" value={String(div.count)} sub={`back to ${String(div.oldest).slice(0, 4)}`} />
              </Grid>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem", fontFamily: MONO }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Ex-Date</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.recent.map((d: any) => (
                      <tr key={d.date} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "6px 14px", color: "var(--text-secondary)" }}>{d.date}</td>
                        <td style={{ padding: "6px 10px", textAlign: "right" }}>{money(d.amount)}</td>
                        <td style={{ padding: "6px 14px", textAlign: "right", color: "var(--text-muted)" }}>{d.paymentDate ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ ...CARD, padding: "14px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>No dividends on record.</div>
          )}

          {/* ── SEC Filings ── */}
          {data.filings?.length > 0 && (
            <>
              <SectionLabel right={<span style={{ fontSize: "0.6rem", textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)" }}>via marketstack EDGAR submissions</span>}>
                SEC Filings
              </SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
                  <thead>
                    <tr style={{ color: "var(--text-secondary)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Form</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>Description</th>
                      <th style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600 }}>Filed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.filings.map((f: any, i: number) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: "7px 14px", fontFamily: MONO, fontWeight: 600, color: "var(--accent-gold)" }}>
                          {f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{f.form}</a> : f.form}
                        </td>
                        <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{f.description}</td>
                        <td style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>{f.filed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Splits ── */}
          {data.splits?.length > 0 && (
            <>
              <SectionLabel>Split History</SectionLabel>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {data.splits.map((s: any) => (
                  <span key={s.date} style={{ ...CARD, borderRadius: 999, padding: "6px 14px", fontFamily: MONO, fontSize: "0.74rem" }}>
                    <span style={{ fontWeight: 700 }}>{s.factor}:1</span>
                    <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>{s.date}</span>
                  </span>
                ))}
              </div>
            </>
          )}

          {/* ── About / Profile ── */}
          {prof?.about && (
            <>
              <SectionLabel>About</SectionLabel>
              <div style={{ ...CARD, padding: "16px 20px", fontSize: "0.82rem", lineHeight: 1.65, color: "var(--text-secondary)" }}>
                {prof.about}
                <div style={{ marginTop: 12, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.9 }}>
                  {prof.employees != null && <div>👥 {Number(prof.employees).toLocaleString()} employees</div>}
                  {prof.address && <div>🏢 {prof.address}</div>}
                  {prof.website && <div>🔗 <a href={prof.website} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>{prof.website}</a></div>}
                </div>
              </div>
            </>
          )}

          {/* ── Executives ── */}
          {prof?.executives?.length > 0 && (
            <>
              <SectionLabel>Key Executives</SectionLabel>
              <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <tbody>
                    {prof.executives.map((e: any, i: number) => (
                      <tr key={i} style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                        <td style={{ padding: "8px 16px", fontWeight: 600 }}>{e.name}</td>
                        <td style={{ padding: "8px 16px", color: "var(--text-secondary)", fontSize: "0.72rem" }}>{e.role ?? "—"}</td>
                        <td style={{ padding: "8px 16px", textAlign: "right", fontFamily: MONO, color: "var(--text-muted)" }}>
                          {e.salary ? `$${Number(e.salary).toLocaleString()}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: "2rem", lineHeight: 1.6 }}>
            All data on this page from marketstack (Business plan) except the interactive chart, which is the
            TradingView widget. Statements/Facts/Concepts endpoints from the pricing page are not live on the
            API yet; ETF holdings currently returns no data.
          </div>
        </>
      )}
    </div>
  );
}

export default function MarketstackResearchPage() {
  return <Suspense fallback={null}><MarketstackResearchInner /></Suspense>;
}
