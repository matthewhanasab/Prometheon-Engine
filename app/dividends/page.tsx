"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const POPULAR = new Set(["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","BRK-B","JPM","V","MA","UNH","XOM","LLY","JNJ","PG","HD","MRK","ABBV","CVX","KO","PEP","COST","WMT","BAC","MCD","TMO","ORCL","CRM","ADBE","NFLX","AMD","INTC","QCOM","TXN","AMAT","INTU","CSCO","IBM","GS","MS","BLK","AXP","SPGI","LMT","RTX","CAT","HON","UPS","DE","GE","NEE","DUK","SO","SLB","COP","EOG","SHW","APD","LIN","FCX","NEM","AMT","EQIX","PLD","SPG","MDT","ABT","SYK","BSX","ISRG","GILD","REGN","VRTX","BMY","PFE","AMGN","SBUX","NKE","TGT","LOW","BKNG","GM","F","CMG","MO","PM","CL","GIS","KMB","NOW","O","VZ","T","MMM","ADP","ITW","EMR","PNC","USB","TROW","BEN"]);

interface DivRow {
  symbol: string;
  date: string;          // ex-dividend date
  recordDate?: string | null;
  paymentDate?: string | null;
  declarationDate?: string | null;
  adjDividend?: number | null;
  dividend?: number | null;
  yield?: number | null;
  frequency?: string | null;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Shared components ────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
      marginBottom: "1rem", marginTop: "2rem",
    }}>{children}</div>
  );
}

function MCard({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string;
  tone?: "good"|"bad"|"neutral"|"default";
}) {
  const top = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "neutral" ? "var(--accent-gold)" : "var(--border)";
  const subColor = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "neutral" ? "var(--accent-gold)" : "var(--text-secondary)";
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderTop: `2px solid ${top}`, borderRadius: 4, padding: "16px 14px 12px" }}>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.65rem", color: subColor, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function EmptyHint({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{
      border: "1px dashed var(--border-active)", borderRadius: 4, background: "var(--bg-surface)",
      padding: "28px 20px", textAlign: "center",
    }}>
      <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{sub}</div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 500,
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const th: React.CSSProperties = {
  textAlign: "right", padding: "8px 14px", fontFamily: "'IBM Plex Sans', sans-serif",
  fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
  color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "8px 14px", borderBottom: "1px solid var(--border)",
  color: "var(--text-secondary)", whiteSpace: "nowrap", textAlign: "right",
};

// ── Page ─────────────────────────────────────────────────────────────────────
function DividendsInner() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"lookup" | "calendar">("lookup");

  // Lookup state
  const [input, setInput] = useState("");
  const [searched, setSearched] = useState("");
  const [history, setHistory] = useState<DivRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  // Calendar state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [calendar, setCalendar] = useState<DivRow[]>([]);
  const [calLoading, setCalLoading] = useState(false);

  async function loadTicker(sym: string) {
    if (!sym.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/dividends?ticker=${encodeURIComponent(sym.trim().toUpperCase())}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setHistory(data.history ?? []);
      setRan(true);
    } catch {
      setError("Could not load dividend data. Check the ticker and try again.");
      setHistory([]);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) {
      const sym = t.toUpperCase();
      setInput(sym);
      setSearched(sym);
      loadTicker(sym);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "calendar") return;
    setCalLoading(true);
    const from = toYMD(new Date(year, month, 1));
    const to = toYMD(new Date(year, month + 1, 0));
    fetch(`/api/dividends?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { setCalendar(d.calendar ?? []); setCalLoading(false); })
      .catch(() => { setCalendar([]); setCalLoading(false); });
  }, [mode, year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  // ── Lookup derived data ──
  const sorted = [...history].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const byYear = new Map<number, number>();
  for (const r of sorted) {
    if (!r.date || r.adjDividend == null && r.dividend == null) continue;
    const y = parseInt(r.date.slice(0, 4));
    if (isNaN(y)) continue;
    byYear.set(y, (byYear.get(y) ?? 0) + (r.adjDividend ?? r.dividend ?? 0));
  }
  const curYear = new Date().getFullYear();
  const annual = Array.from(byYear.entries())
    .map(([y, total]) => ({ year: y, total }))
    .sort((a, b) => a.year - b.year);

  // Consecutive payment years counted back from the most recent full year
  let consecYears = 0;
  {
    const yearsPaid = new Set(annual.filter((a) => a.total > 0).map((a) => a.year));
    let y = yearsPaid.has(curYear) ? curYear : curYear - 1;
    while (yearsPaid.has(y)) { consecYears++; y--; }
  }

  // 5-yr dividend CAGR from complete years (exclude current partial year)
  const complete = annual.filter((a) => a.year < curYear && a.total > 0);
  let cagr5: number | null = null;
  if (complete.length >= 2) {
    const last = complete[complete.length - 1];
    const target = complete.find((a) => a.year === last.year - 5) ?? complete[0];
    const span = last.year - target.year;
    if (span > 0 && target.total > 0) {
      cagr5 = (Math.pow(last.total / target.total, 1 / span) - 1) * 100;
    }
  }

  const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const curYield = latest?.yield ?? null;
  const frequency = latest?.frequency ?? null;
  const last12 = [...sorted].reverse().slice(0, 12);

  // ── Calendar derived data ──
  const calRows = (() => {
    const valid = calendar.filter((r) => r.symbol && (r.dividend != null || r.adjDividend != null));
    const rank = (r: DivRow) => (POPULAR.has(r.symbol.toUpperCase()) ? 0 : 1);
    return valid
      .sort((a, b) => rank(a) - rank(b) || (b.yield ?? 0) - (a.yield ?? 0))
      .slice(0, 100);
  })();

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Dividend Hub
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Payment history, yield, and growth for any dividend payer — plus the full ex-dividend calendar
      </div>

      {/* Mode toggle */}
      <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden", width: "fit-content", marginBottom: "1.5rem" }}>
        {([["lookup", "Stock Lookup"], ["calendar", "Ex-Dividend Calendar"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{
            padding: "0.45rem 1rem", fontSize: "0.75rem", fontWeight: 600,
            background: mode === k ? "var(--accent-gold)" : "transparent",
            color: mode === k ? "#131C2E" : "var(--text-secondary)",
            border: "none", cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif",
          }}>
            {label}
          </button>
        ))}
      </div>

      {mode === "lookup" && (
        <>
          {/* Search */}
          <form onSubmit={(e) => { e.preventDefault(); setSearched(input.trim().toUpperCase()); loadTicker(input); }}
            style={{ display: "flex", gap: 10, marginBottom: "2rem", maxWidth: 380 }}>
            <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
              style={{
                flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4,
                padding: "10px 14px", color: "var(--text-primary)", fontFamily: "'IBM Plex Mono', monospace",
                fontSize: "0.85rem", outline: "none",
              }} />
            <button type="submit" style={{
              background: "var(--accent-gold)", color: "#131C2E", border: "none", borderRadius: 4,
              padding: "10px 22px", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem",
              fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer",
            }}>Analyze</button>
          </form>

          {loading && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "40px 0" }}>Loading {searched}…</div>}
          {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

          {!loading && !error && !ran && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              <EmptyHint title="Dividend history chart" sub="Annual dividend per share, going back a decade" />
              <EmptyHint title="Yield · frequency · streak" sub="Current yield, payment cadence, consecutive years paid" />
              <EmptyHint title="5-year dividend CAGR" sub="How fast the payout is actually growing" />
              <EmptyHint title="Last 12 payments" sub="Ex-date, record, payment date and amount" />
            </div>
          )}

          {!loading && ran && history.length === 0 && !error && (
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4,
              padding: "48px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem",
            }}>
              No dividend history found for {searched}. It may not pay a dividend.
            </div>
          )}

          {!loading && history.length > 0 && (
            <>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <MCard label="Current Yield"
                  value={curYield != null ? `${curYield.toFixed(2)}%` : "N/A"}
                  sub={curYield != null ? (curYield > 4 ? "High yield — check sustainability" : curYield > 1.5 ? "Healthy yield" : "Modest yield") : undefined}
                  tone={curYield != null ? (curYield > 4 ? "neutral" : curYield > 1.5 ? "good" : "default") : "default"} />
                <MCard label="Frequency" value={frequency ?? "N/A"} sub="Payment cadence" />
                <MCard label="Consecutive Years" value={consecYears > 0 ? String(consecYears) : "N/A"}
                  sub={consecYears >= 10 ? "Long payment streak" : consecYears > 0 ? "Years of uninterrupted payments" : undefined}
                  tone={consecYears >= 10 ? "good" : "default"} />
                <MCard label="5-Yr Dividend CAGR"
                  value={cagr5 != null ? `${cagr5 >= 0 ? "+" : ""}${cagr5.toFixed(1)}%` : "N/A"}
                  sub={cagr5 == null ? "Insufficient history" : cagr5 > 7 ? "Fast dividend growth" : cagr5 > 0 ? "Growing payout" : "Shrinking payout"}
                  tone={cagr5 == null ? "default" : cagr5 > 7 ? "good" : cagr5 > 0 ? "neutral" : "bad"} />
              </div>

              {/* Annual bar chart */}
              {annual.length > 0 && (
                <>
                  <SectionLabel>Dividend Per Share by Year — {searched}</SectionLabel>
                  <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 8px 4px" }}>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={annual} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="year" tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v: any) => `$${Number(v).toFixed(2)}`} tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false} width={56} />
                        <Tooltip
                          labelStyle={{ color: "#F1F5F9" }}
                          itemStyle={{ color: "#F1F5F9" }}
                          cursor={{ fill: "rgba(76, 97, 144, 0.18)" }}
                          formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "Dividend/share"]}
                          contentStyle={{ background: "#283552", border: "1px solid #4C6190", borderRadius: 4, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                        />
                        <Bar dataKey="total" fill="#D4B45E" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 6 }}>
                    Calendar-year sums of adjusted dividends · Current year may be partial
                  </div>
                </>
              )}

              {/* Last 12 payments */}
              <SectionLabel>Last 12 Payments</SectionLabel>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-primary)" }}>
                      <th style={{ ...th, textAlign: "left" }}>Ex-Date</th>
                      <th style={th}>Record</th>
                      <th style={th}>Payment</th>
                      <th style={th}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {last12.map((r, i) => (
                      <tr key={r.date + i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                        <td style={{ ...td, textAlign: "left", color: "var(--text-primary)", fontWeight: 600 }}>{r.date ?? "—"}</td>
                        <td style={td}>{r.recordDate || "—"}</td>
                        <td style={td}>{r.paymentDate || "—"}</td>
                        <td style={{ ...td, color: "var(--accent-gold)", fontWeight: 600 }}>
                          {(r.adjDividend ?? r.dividend) != null ? `$${(r.adjDividend ?? r.dividend)!.toFixed(4)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {mode === "calendar" && (
        <>
          {/* Month picker */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
            <button onClick={() => shiftMonth(-1)} style={navBtn}>← {new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" })}</button>
            <span style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontWeight: 600, fontSize: "1.2rem", minWidth: 200, textAlign: "center" }}>
              {new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => shiftMonth(1)} style={navBtn}>{new Date(year, month + 1, 1).toLocaleDateString("en-US", { month: "short" })} →</button>
            {!(year === now.getFullYear() && month === now.getMonth()) && (
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
                style={{ ...navBtn, color: "var(--accent-gold)", borderColor: "var(--accent-gold)" }}>
                This Month
              </button>
            )}
          </div>

          {calLoading && (
            <div style={{ color: "var(--text-secondary)", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
              Loading calendar…
            </div>
          )}

          {!calLoading && calRows.length === 0 && (
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4,
              padding: "48px", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem",
            }}>
              No ex-dividend dates found for this month.
            </div>
          )}

          {!calLoading && calRows.length > 0 && (
            <>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-primary)" }}>
                      <th style={{ ...th, textAlign: "left" }}>Ticker</th>
                      <th style={th}>Ex-Date</th>
                      <th style={th}>Payment Date</th>
                      <th style={th}>Dividend</th>
                      <th style={th}>Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calRows.map((r, i) => (
                      <tr key={r.symbol + r.date + i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                        <td style={{ ...td, textAlign: "left" }}>
                          <Link href={`/research?ticker=${r.symbol}`} style={{ color: "var(--accent-gold)", fontWeight: 700, textDecoration: "none" }}>
                            {r.symbol}
                          </Link>
                          {POPULAR.has(r.symbol.toUpperCase()) && (
                            <span style={{ marginLeft: 8, fontSize: "0.58rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                              Large cap
                            </span>
                          )}
                        </td>
                        <td style={td}>{r.date ?? "—"}</td>
                        <td style={td}>{r.paymentDate || "—"}</td>
                        <td style={{ ...td, color: "var(--text-primary)" }}>
                          {(r.adjDividend ?? r.dividend) != null ? `$${(r.adjDividend ?? r.dividend)!.toFixed(4)}` : "—"}
                        </td>
                        <td style={{ ...td, color: (r.yield ?? 0) > 0 ? "var(--positive)" : "var(--text-secondary)" }}>
                          {r.yield != null ? `${r.yield.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 8 }}>
                Showing up to 100 entries — well-known large caps first, then by yield · Buy before the ex-date to receive the dividend · Not financial advice
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function DividendsPage() {
  return <Suspense fallback={null}><DividendsInner /></Suspense>;
}
