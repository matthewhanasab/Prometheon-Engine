"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import CompanyLogo from "@/components/CompanyLogo";

// Earnings — Market Stack edition.
//
// Two halves, from two sources that carry no licensing cost:
//   • upcoming calendar → next expected report dates, projected from each
//     company's real SEC 8-K (item 2.02) earnings-announcement history
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

type Session = "bmo" | "amc" | "other";
type CalEntry = {
  ticker: string; name: string; last: string; next: string;
  session: Session; regular: boolean;
};
type Universe = "sp500" | "all";

const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parseISO = (iso: string) => new Date(iso + "T00:00:00Z");
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
function addDaysISO(iso: string, n: number) {
  const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d);
}
/** Monday of the week containing `iso`. */
function mondayOf(iso: string) {
  const d = parseISO(iso);
  const dow = d.getUTCDay();             // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;  // Sunday belongs to the week just gone
  return addDaysISO(iso, -back);
}

// Upcoming earnings, as a trading-week calendar: one column per weekday, split
// into the two sessions companies actually report in. Which session comes from
// the acceptance timestamp on each company's past 8-K item 2.02 filings —
// before 9:30 ET is a pre-open release, 16:00 ET or later is post-close.
function UpcomingEarnings({ onPick }: { onPick: (t: string) => void }) {
  const [universe, setUniverse] = useState<Universe>("sp500");
  const [byUniverse, setByUniverse] = useState<Record<string, CalEntry[]>>({});
  const [progress, setProgress] = useState<{ done: number; total: number; complete: boolean } | null>(null);
  const [failed, setFailed] = useState(false);
  const todayISO = new Date().toISOString().slice(0, 10);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));

  // The scan can exceed a single request from cold, so keep polling while the
  // API reports itself incomplete — each round resumes further through the
  // universe and returns a fuller set.
  useEffect(() => {
    let alive = true;
    setFailed(false);
    (async () => {
      for (let round = 0; round < 6; round++) {
        try {
          const res = await fetch(`/api/earnings-calendar?universe=${universe}`);
          const j = await res.json();
          if (!alive) return;
          if (!Array.isArray(j?.entries)) { setFailed(true); return; }
          setByUniverse((prev) => ({ ...prev, [universe]: j.entries }));
          setProgress(j.progress ?? null);
          if (j.progress?.complete) return;
        } catch {
          if (alive) setFailed(true);
          return;
        }
      }
    })();
    return () => { alive = false; };
  }, [universe]);

  const entries = byUniverse[universe];
  const loading = !entries;

  const days = Array.from({ length: 5 }, (_, i) => addDaysISO(weekStart, i));
  const weekEnd = days[4];
  const inWeek = (entries ?? []).filter((e) => e.next >= weekStart && e.next <= weekEnd);
  // Two visible sessions; the rare intraday filing rides with the after-close
  // group rather than being dropped, and its tooltip says so.
  const bucket = (day: string, s: "bmo" | "amc") =>
    inWeek
      .filter((e) => e.next === day && (s === "bmo" ? e.session === "bmo" : e.session !== "bmo"))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const label = (() => {
    const d = parseISO(weekStart);
    return `WEEK OF ${MONTHS_LONG[d.getUTCMonth()].toUpperCase()} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  })();

  const navBtn: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)",
    borderRadius: 999, padding: "7px 14px", fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "1.6rem 0 0.9rem" }}>
        <div style={{ fontFamily: SERIF, fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)" }}>
          {label}
        </div>

        <div style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
          {([["sp500", "S&P 500"], ["all", "All Stocks"]] as const).map(([k, lab]) => (
            <button key={k} type="button" onClick={() => setUniverse(k)}
              style={{
                padding: "5px 13px", borderRadius: 999, border: "none", cursor: "pointer",
                fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em",
                background: universe === k ? "var(--accent-gold)" : "transparent",
                color: universe === k ? "var(--on-accent)" : "var(--text-secondary)",
              }}>{lab}</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>
          <button type="button" style={navBtn} onClick={() => setWeekStart((w) => addDaysISO(w, -7))}>◀ Prev</button>
          <button type="button" style={navBtn} onClick={() => setWeekStart(mondayOf(todayISO))}>This week</button>
          <button type="button" style={navBtn} onClick={() => setWeekStart((w) => addDaysISO(w, 7))}>Next ▶</button>
        </div>
      </div>

      {progress && !progress.complete && !failed && (
        <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginBottom: 8, fontFamily: MONO }}>
          Scanning SEC filings — {progress.done} of {progress.total} companies…
        </div>
      )}
      {failed && (
        <div style={{ ...CARD, padding: "18px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Calendar not available with current data.
        </div>
      )}

      {!failed && (
        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(184px, 1fr))", gap: 10, minWidth: 940 }}>
            {days.map((day, i) => {
              const isToday = day === todayISO;
              const d = parseISO(day);
              const cols: [string, CalEntry[]][] = [
                ["Before Open", bucket(day, "bmo")],
                ["After Close", bucket(day, "amc")],
              ];
              return (
                <div key={day} style={{ ...CARD, padding: 0, overflow: "hidden", borderColor: isToday ? "var(--accent-gold)" : "var(--border)" }}>
                  <div style={{
                    padding: "10px 12px", textAlign: "center",
                    background: isToday ? "var(--accent-gold)" : "var(--bg-elevated)",
                    color: isToday ? "var(--on-accent)" : "var(--text-primary)",
                    fontFamily: SANS, fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.12em",
                  }}>
                    {DAY_NAMES[i]}
                    <div style={{ fontFamily: MONO, fontSize: "0.6rem", fontWeight: 500, opacity: 0.75, letterSpacing: 0, marginTop: 2 }}>
                      {MONTHS[d.getUTCMonth()]} {d.getUTCDate()}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--border)" }}>
                    {cols.map(([heading, list]) => (
                      <div key={heading} style={{ background: "var(--bg-surface)", padding: "8px 6px", minHeight: 96 }}>
                        <div style={{
                          fontFamily: SANS, fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase",
                          letterSpacing: "0.09em", color: "var(--text-muted)", textAlign: "center", marginBottom: 6,
                        }}>{heading}</div>
                        {loading ? (
                          Array.from({ length: 3 }).map((_, k) => (
                            <div key={k} style={{ height: 26, borderRadius: 7, background: "var(--bg-elevated)", marginBottom: 4 }} />
                          ))
                        ) : list.length === 0 ? (
                          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.62rem", paddingTop: 10 }}>—</div>
                        ) : (
                          list.map((e) => (
                            <button key={e.ticker} type="button" onClick={() => onPick(e.ticker)}
                              title={`${e.name} — expected ${e.next}, ${e.session === "bmo" ? "before open" : e.session === "amc" ? "after close" : "filed during market hours"} (last reported ${e.last})`}
                              style={{
                                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                                gap: 6, marginBottom: 4, padding: "4px 5px", cursor: "pointer",
                                background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8,
                              }}>
                              <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.68rem", color: "var(--text-primary)" }}>
                                {e.ticker}
                              </span>
                              {/* No monogram fallback here: the ticker is already
                                  the label, so a "ND" tile beside "NDSN" just
                                  reads as doubled text. */}
                              <CompanyLogo ticker={e.ticker} size={20} />
                            </button>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !failed && (
        <div style={{ fontSize: "0.64rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
          {inWeek.length} {universe === "sp500" ? "S&P 500" : "S&P 1500"} companies expected this week.
          Dates and sessions are <strong>projected</strong> from each company&apos;s own SEC 8-K (item 2.02)
          filing history — they are not company-announced dates, so a firm that shifts its schedule will move.
          Index membership comes from the holdings of the funds tracking it, as filed on Form N-PORT.
        </div>
      )}
    </>
  );
}

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

  const companyRef = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef(false);
  function pick(t: string) {
    pendingScroll.current = true;
    load(t);
  }
  // Scroll to the company section only once its content has actually loaded —
  // the app scrolls inside an inner container, so a fixed timeout races the
  // loading-collapse; keying off data + loading lands it every time.
  useEffect(() => {
    if (!loading && data && pendingScroll.current) {
      pendingScroll.current = false;
      companyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, data]);

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

      <Label hint="expected dates &amp; sessions, projected from SEC 8-K (item 2.02) filing history">Upcoming Earnings</Label>
      <UpcomingEarnings onPick={pick} />

      <div ref={companyRef} style={{ scrollMarginTop: 12 }} />
      <Label hint="look up any company's as-filed history">Company History</Label>
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
    </div>
  );
}

export default function MsEarningsPage() {
  return <Suspense fallback={null}><EarningsInner /></Suspense>;
}
