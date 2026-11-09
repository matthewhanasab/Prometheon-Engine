"use client";
import { useState, useEffect, useSyncExternalStore, Suspense } from "react";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import PageHeader from "@/components/PageHeader";
import Icon from "@/components/Icon";
import { ErrorNote } from "@/components/States";

// Earnings calendar — a trading week at a time, one column per weekday.
//
// Each week is fetched on its own from /api/earnings-calendar: scheduled dates
// with the time of day and the consensus EPS estimate for near weeks, and
// filing-cadence projections (flagged as such) for weeks further out than
// companies have announced.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};

type Entry = {
  ticker: string; name: string; date: string;
  time: "pre" | "post" | null;
  epsEstimate: number | null; estimates: number | null;
  epsActual: number | null; surprisePct: number | null;
  marketCap: number | null; sp500: boolean;
};
type Week = { source: "scheduled" | "projected"; degraded: boolean; entries: Entry[] };
type Universe = "top" | "sp500" | "all";

// "Top names" is a size cut: companies worth $100 billion or more, the ones
// whose results move the whole market. Around 170 US-listed companies qualify,
// so a busy week shows a few dozen instead of a few hundred.
const TOP_CAP = 100e9;
const inUniverse = (u: Universe) => (e: Entry) =>
  u === "all" ? true : u === "sp500" ? e.sp500 : (e.marketCap ?? 0) >= TOP_CAP;

// A peak day has 400+ reporters across the whole market. Each column shows the
// largest companies first and tucks the rest behind an expander.
const DAY_LIMIT = 10;

const fmtEps = (v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`;

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

// The grid runs Monday to Friday, so on a weekend "this week" is a week whose
// every column is already in the past — opening there showed a board of dashes
// and looked broken. Weekends roll forward to the week that's still ahead.
function currentWeekStart(iso: string) {
  const dow = parseISO(iso).getUTCDay();
  const monday = mondayOf(iso);
  return dow === 0 || dow === 6 ? addDaysISO(monday, 7) : monday;
}

// "Today" is the viewer's own calendar day. Taking it from UTC lit up Monday's
// column on a Sunday evening in the US. The server can't know the viewer's
// clock, so it renders with the UTC day and the browser corrects on hydration.
const pad2 = (n: number) => String(n).padStart(2, "0");
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const utcToday = () => new Date().toISOString().slice(0, 10);
const noSubscribe = () => () => {};

function EarningsInner() {
  const [universe, setUniverse] = useState<Universe>("sp500");
  const [weeks, setWeeks] = useState<Record<string, Week>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [attempt, setAttempt] = useState(0);
  const todayISO = useSyncExternalStore(noSubscribe, localToday, utcToday);
  // null = follow the current week; set once the viewer navigates.
  const [picked, setPicked] = useState<string | null>(null);
  const weekStart = picked ?? currentWeekStart(todayISO);
  const setWeekStart = (w: string) => setPicked(w);

  useEffect(() => {
    let alive = true;
    // The week on screen, plus the one after so "Next" opens without a wait.
    for (const wk of [weekStart, addDaysISO(weekStart, 7)]) {
      if (weeks[wk]) continue;
      fetch(`/api/earnings-calendar?week=${wk}`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          if (Array.isArray(j?.entries)) {
            setWeeks((p) => ({ ...p, [wk]: { source: j.source, degraded: !!j.degraded, entries: j.entries } }));
          } else setFailed((p) => ({ ...p, [wk]: true }));
        })
        .catch(() => { if (alive) setFailed((p) => ({ ...p, [wk]: true })); });
    }
    return () => { alive = false; };
    // `weeks` is deliberately not a dependency: storing a result must not
    // cancel the sibling request that is still in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, attempt]);

  const week = weeks[weekStart];
  const isFailed = !week && !!failed[weekStart];
  const loading = !week && !isFailed;
  const projected = week?.source === "projected";

  const days = Array.from({ length: 5 }, (_, i) => addDaysISO(weekStart, i));
  const inWeek = (week?.entries ?? []).filter(inUniverse(universe));
  const forDay = (day: string) =>
    inWeek.filter((e) => e.date === day)
      .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1) || a.ticker.localeCompare(b.ticker));

  // Early in a quarter a week can hold only two or three reports, which reads
  // as an empty page. The following week is already loaded for the Next
  // button, so its largest names are previewed underneath.
  const nextStart = addDaysISO(weekStart, 7);
  const upNext = (weeks[nextStart]?.entries ?? [])
    .filter(inUniverse(universe))
    .sort((a, b) => (b.marketCap ?? -1) - (a.marketCap ?? -1) || a.date.localeCompare(b.date))
    .slice(0, 10);

  const retry = () => {
    setFailed((p) => ({ ...p, [weekStart]: false }));
    setAttempt((n) => n + 1);
  };

  const weekLabel = (() => {
    const d = parseISO(weekStart);
    return `Week of ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  })();

  const navBtn: React.CSSProperties = {
    background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)",
    borderRadius: 999, padding: "7px 14px", fontFamily: SANS, fontSize: "0.76rem", fontWeight: 600,
    cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4,
  };

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Earnings Calendar" subtitle="Who reports this week, when in the day, and what analysts expect." />

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: "1rem" }}>
        <h2 aria-live="polite" style={{ fontFamily: SERIF, fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          {weekLabel}
        </h2>

        <div role="group" aria-label="Which companies to show" style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
          {([["top", "Top names", "Companies worth $100 billion or more"], ["sp500", "S&P 500", "Members of the S&P 500 index"], ["all", "All stocks", "Every company reporting"]] as const).map(([k, lab, tip]) => (
            <button key={k} type="button" title={tip} aria-pressed={universe === k} onClick={() => setUniverse(k)}
              style={{
                padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                fontFamily: SANS, fontSize: "0.76rem", fontWeight: 600,
                background: universe === k ? "var(--accent-gold)" : "transparent",
                color: universe === k ? "var(--on-accent)" : "var(--text-secondary)",
              }}>{lab}</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "inline-flex", gap: 8 }}>
          <button type="button" style={navBtn} onClick={() => setWeekStart(addDaysISO(weekStart, -7))} aria-label="Previous week"><Icon name="chevron-left" size={14} strokeWidth={2.2} /> Prev</button>
          <button type="button" style={navBtn} onClick={() => setPicked(null)}>This week</button>
          <button type="button" style={navBtn} onClick={() => setWeekStart(addDaysISO(weekStart, 7))} aria-label="Next week">Next <Icon name="chevron-right" size={14} strokeWidth={2.2} /></button>
        </div>
      </div>

      {loading && (
        <div style={{
          ...CARD, borderColor: "var(--border-active)", display: "flex", alignItems: "center", gap: 14,
          padding: "16px 18px", marginBottom: 14,
        }}>
          <span className="spinner" style={{ width: 20, height: 20, flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: SANS, fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-gold)" }}>
              Loading the week of {MONTHS_LONG[parseISO(weekStart).getUTCMonth()]} {parseISO(weekStart).getUTCDate()}…
            </div>
            <div style={{ fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>
              Pulling each day&rsquo;s scheduled reports, times and estimates. Usually a second or two.
            </div>
          </div>
        </div>
      )}

      {isFailed ? (
        <ErrorNote title="The calendar didn't load" message="The data service didn't answer. This is usually momentary." onRetry={retry} />
      ) : (
        <div>
          {/* auto-fit: five columns on a desktop, wrapping down to one per row
              on a phone instead of a sideways-scrolling strip. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
            {days.map((day, i) => {
              const isToday = day === todayISO;
              const list = forDay(day);
              const open = !!expanded[day];
              const shown = open ? list : list.slice(0, DAY_LIMIT);
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
                    fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 800, letterSpacing: "0.12em",
                  }}>
                    {DAY_NAMES[i]}
                    <div style={{ fontFamily: MONO, fontSize: "0.6875rem", fontWeight: 500, opacity: 0.75, letterSpacing: 0, marginTop: 2 }}>
                      {MONTHS[d.getUTCMonth()]} {d.getUTCDate()}{!loading && list.length > 0 ? ` · ${list.length}` : ""}
                    </div>
                  </div>

                  <div style={{ padding: "8px 8px 10px", minHeight: 120 }}>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, k) => (
                        <div key={k} className={`skeleton-bar skeleton-d${((i + k) % 3) + 1}`}
                          style={{ height: 44, borderRadius: 9, marginBottom: 5 }} />
                      ))
                    ) : list.length === 0 ? (
                      <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.7rem", paddingTop: 16 }}>
                        No reports
                      </div>
                    ) : (
                      <>
                        {shown.map((e) => {
                          const reported = e.epsActual != null;
                          const beat = reported && e.epsEstimate != null ? e.epsActual! >= e.epsEstimate : null;
                          return (
                            <Link key={e.ticker} className="pressable" href={`/research?ticker=${e.ticker}`} title={e.name}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, marginBottom: 5,
                                padding: "6px 8px", textDecoration: "none",
                                background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9,
                              }}>
                              <span style={{ width: 22, height: 22, flexShrink: 0, display: "inline-flex" }}>
                                <CompanyLogo ticker={e.ticker} size={22} fallback />
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.74rem", color: "var(--text-primary)" }}>
                                    {e.ticker}
                                  </span>
                                  {e.time && (
                                    <span style={{ fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                      {e.time === "pre" ? "Before open" : "After close"}
                                    </span>
                                  )}
                                </span>
                                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginTop: 2 }}>
                                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                                    {e.name}
                                  </span>
                                  {reported ? (
                                    <span style={{
                                      fontFamily: MONO, fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap",
                                      color: beat == null ? "var(--text-secondary)" : beat ? "var(--positive)" : "var(--negative)",
                                    }}>
                                      {fmtEps(e.epsActual!)}{e.epsEstimate != null ? ` vs ${fmtEps(e.epsEstimate)}` : ""}
                                    </span>
                                  ) : e.epsEstimate != null ? (
                                    <span style={{ fontFamily: MONO, fontSize: "0.6875rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                      Est {fmtEps(e.epsEstimate)}
                                    </span>
                                  ) : null}
                                </span>
                              </span>
                            </Link>
                          );
                        })}
                        {list.length > DAY_LIMIT && (
                          <button type="button"
                            onClick={() => setExpanded((p) => ({ ...p, [day]: !open }))}
                            style={{
                              width: "100%", marginTop: 2, padding: "6px 8px", cursor: "pointer",
                              background: "transparent", border: "1px dashed var(--border)", borderRadius: 9,
                              fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-secondary)",
                            }}>
                            {open ? "Show fewer" : `+ ${list.length - DAY_LIMIT} more`}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !isFailed && (
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
          {inWeek.length} {inWeek.length === 1 ? "company" : "companies"} {days[4] < todayISO ? "reported" : "reporting"} this week, largest first.
          {universe === "top" && <> Top names are companies worth $100 billion or more.</>}
          {projected
            ? <> Companies haven&apos;t announced dates this far ahead, so these are <strong>projected</strong> from each company&apos;s past reporting pattern and can shift by a day or two.</>
            : <> EPS figures are the analyst consensus; once a company reports, its actual result is shown against that estimate.</>}
          {week?.degraded && <> Some days didn&apos;t load — refresh in a moment for the full week.</>}
        </div>
      )}

      {!loading && !isFailed && upNext.length > 0 && (
        <div style={{ marginTop: "1.6rem" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            fontSize: "0.6875rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 10,
          }}>
            Biggest reports the week after
            <button type="button" onClick={() => setWeekStart(nextStart)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SANS, fontSize: "0.76rem", fontWeight: 600, color: "var(--accent-gold)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              See full week <Icon name="arrow-right" size={13} />
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {upNext.map((e) => {
              const d = parseISO(e.date);
              return (
                <Link key={e.ticker} className="pressable" href={`/research?ticker=${e.ticker}`} title={e.name}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 8px", textDecoration: "none",
                    background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999,
                  }}>
                  <span style={{ width: 20, height: 20, flexShrink: 0, display: "inline-flex" }}>
                    <CompanyLogo ticker={e.ticker} size={20} fallback />
                  </span>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: "0.72rem", color: "var(--text-primary)" }}>{e.ticker}</span>
                  <span style={{ fontFamily: MONO, fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                    {DAY_NAMES[(d.getUTCDay() + 6) % 7]?.slice(0, 3)} {MONTHS[d.getUTCMonth()]} {d.getUTCDate()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EarningsPage() {
  return <Suspense fallback={null}><EarningsInner /></Suspense>;
}
