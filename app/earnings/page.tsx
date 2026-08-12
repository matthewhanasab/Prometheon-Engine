"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";

// Earnings calendar — a trading week at a time, one column per weekday.
//
// Dates are projected from each company's own SEC 8-K (item 2.02) filing
// history: those filings are the real earnings-announcement record, and the
// next date follows the cadence. Served from a precomputed snapshot so the page
// paints instantly (see scripts/build-earnings-calendar.mjs).
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

type Entry = { ticker: string; name: string; next: string; sp500: boolean };
type Universe = "sp500" | "all";

const DAY_NAMES = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parseISO = (iso: string) => new Date(iso + "T00:00:00Z");
function addDaysISO(iso: string, n: number) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Monday of the week containing `iso`. */
function mondayOf(iso: string) {
  const dow = parseISO(iso).getUTCDay();          // 0 = Sunday
  return addDaysISO(iso, -(dow === 0 ? 6 : dow - 1));
}

function EarningsInner() {
  const [universe, setUniverse] = useState<Universe>("sp500");
  const [cache, setCache] = useState<Record<string, Entry[]>>({});
  const [failed, setFailed] = useState(false);
  const todayISO = new Date().toISOString().slice(0, 10);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)));

  useEffect(() => {
    if (cache[universe]) return;
    let alive = true;
    fetch(`/api/earnings-calendar?universe=${universe}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (Array.isArray(j?.entries)) setCache((p) => ({ ...p, [universe]: j.entries }));
        else setFailed(true);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [universe, cache]);

  const entries = cache[universe];
  const loading = !entries && !failed;

  const days = Array.from({ length: 5 }, (_, i) => addDaysISO(weekStart, i));
  const inWeek = (entries ?? []).filter((e) => e.next >= days[0] && e.next <= days[4]);
  const forDay = (day: string) =>
    inWeek.filter((e) => e.next === day).sort((a, b) => a.ticker.localeCompare(b.ticker));

  const weekLabel = (() => {
    const d = parseISO(weekStart);
    return `WEEK OF ${MONTHS_LONG[d.getUTCMonth()].toUpperCase()} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  })();

  const navBtn: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)",
    borderRadius: 999, padding: "7px 14px", fontFamily: SANS, fontSize: "0.62rem", fontWeight: 700,
    letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", whiteSpace: "nowrap",
  };

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Earnings Calendar
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Expected report dates, projected from each company&apos;s SEC 8-K (item 2.02) filing history.
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ fontFamily: SERIF, fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
          {weekLabel}
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

        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <button type="button" style={navBtn} onClick={() => setWeekStart((w) => addDaysISO(w, -7))}>◀ Prev</button>
          <button type="button" style={navBtn} onClick={() => setWeekStart(mondayOf(todayISO))}>This week</button>
          <button type="button" style={navBtn} onClick={() => setWeekStart((w) => addDaysISO(w, 7))}>Next ▶</button>
        </div>
      </div>

      {failed ? (
        <div style={{ ...CARD, padding: "18px 20px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Calendar not available with current data.
        </div>
      ) : (
        <div style={{ overflowX: "auto", paddingBottom: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(170px, 1fr))", gap: 10, minWidth: 880 }}>
            {days.map((day, i) => {
              const isToday = day === todayISO;
              const list = forDay(day);
              const d = parseISO(day);
              return (
                <div key={day} style={{
                  ...CARD, padding: 0, overflow: "hidden",
                  borderColor: isToday ? "var(--accent-gold)" : "var(--border)",
                }}>
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

                  <div style={{ padding: "8px 8px 10px", minHeight: 120 }}>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, k) => (
                        <div key={k} style={{ height: 32, borderRadius: 9, background: "var(--bg-elevated)", marginBottom: 5 }} />
                      ))
                    ) : list.length === 0 ? (
                      <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.66rem", paddingTop: 16 }}>—</div>
                    ) : (
                      list.map((e) => (
                        <Link key={e.ticker} href={`/research?ticker=${e.ticker}`} title={`${e.name} — expected ${e.next}`}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 5,
                            padding: "6px 8px", textDecoration: "none",
                            background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9,
                          }}>
                          {/* Fixed box: CompanyLogo removes itself when a
                              ticker has no resolvable icon, which would
                              otherwise slide that row's ticker out of line. */}
                          <span style={{ width: 22, height: 22, flexShrink: 0, display: "inline-flex" }}>
                            <CompanyLogo ticker={e.ticker} size={22} />
                          </span>
                          <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.74rem", color: "var(--text-primary)" }}>
                            {e.ticker}
                          </span>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !failed && (
        <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
          {inWeek.length} companies expected this week.
          Dates are <strong>projected</strong> from SEC 8-K (item 2.02) filing cadence — they are not
          company-announced dates, so a firm that reschedules will move.
        </div>
      )}
    </div>
  );
}

export default function EarningsPage() {
  return <Suspense fallback={null}><EarningsInner /></Suspense>;
}
