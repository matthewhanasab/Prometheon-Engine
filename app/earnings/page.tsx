"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const POPULAR = new Set(["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","BRK-B","JPM","V","MA","UNH","XOM","LLY","JNJ","PG","HD","MRK","ABBV","CVX","KO","PEP","COST","WMT","BAC","MCD","TMO","ORCL","CRM","ADBE","NFLX","AMD","INTC","QCOM","TXN","AMAT","INTU","CSCO","IBM","GS","MS","BLK","AXP","SPGI","LMT","RTX","CAT","HON","UPS","DE","GE","NEE","DUK","SO","SLB","COP","EOG","SHW","APD","LIN","FCX","NEM","AMT","EQIX","PLD","SPG","MDT","ABT","SYK","BSX","ISRG","GILD","REGN","VRTX","BMY","PFE","AMGN","SBUX","NKE","TGT","LOW","BKNG","GM","F","CMG","MO","PM","CL","GIS","KMB","NOW","WDAY","SNOW","PLTR","PANW","CRWD","ZS","DDOG","SHOP","TTD"]);

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const MAX_CHIPS = 9;

interface EarningsEntry {
  symbol: string;
  date: string;
  hour: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// All weekdays of the month, grouped into calendar weeks (Mon-Fri)
function monthWeeks(year: number, month: number): (Date | null)[][] {
  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];
  const first = new Date(year, month, 1);
  // pad to Monday
  let dow = first.getDay(); // 0 sun ... 6 sat
  if (dow === 0) dow = 7;   // treat sunday as end of prior week
  for (let i = 1; i < dow && i <= 5; i++) week.push(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const w = d.getDay();
    if (w === 0 || w === 6) continue; // skip weekends
    week.push(d);
    if (w === 5) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 5) week.push(null);
    weeks.push(week);
  }
  // pad first week trailing
  if (weeks[0] && weeks[0].length < 5) {
    while (weeks[0].length < 5) weeks[0].push(null);
  }
  return weeks;
}

function Chip({ entry, side }: { entry: EarningsEntry; side: "bmo" | "amc" | "other" }) {
  const borderColor = side === "bmo" ? "#5BD1EF" : side === "amc" ? "var(--negative)" : "var(--border-active)";
  return (
    <a href={`/research?ticker=${entry.symbol}`} style={{ textDecoration: "none" }}>
      <span style={{
        display: "inline-block",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 20,
        padding: "0.15rem 0.4rem",
        fontWeight: 700,
        fontFamily: "'Spline Sans Mono', monospace",
        fontSize: "0.68rem",
        letterSpacing: "0.02em",
        color: "var(--text-primary)",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}>
        {entry.symbol}
      </span>
    </a>
  );
}

const navBtn: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 500,
  fontFamily: "'Public Sans', sans-serif",
};

function EarningsInner() {
  const searchParams = useSearchParams();

  // initial month: from ?week=YYYY-MM-DD if present, else current month
  const init = (() => {
    const w = searchParams.get("week");
    if (w) {
      const d = new Date(w + "T00:00:00");
      if (!isNaN(d.getTime())) return { y: d.getFullYear(), m: d.getMonth() };
    }
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  })();

  const [year, setYear] = useState(init.y);
  const [month, setMonth] = useState(init.m);
  const [filter, setFilter] = useState<"popular" | "all">("popular");
  const [data, setData] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    const from = toYMD(new Date(year, month, 1));
    const to = toYMD(new Date(year, month + 1, 0));
    fetch(`/api/earnings-calendar?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d.earnings ?? []); setLoading(false); })
      .catch(() => { setError("Failed to load earnings data."); setLoading(false); });
  }, [year, month]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const filtered = filter === "popular"
    ? data.filter(e => POPULAR.has(e.symbol?.toUpperCase()))
    : data;

  const byDay = new Map<string, EarningsEntry[]>();
  for (const e of filtered) {
    if (!e.date) continue;
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date)!.push(e);
  }
  // bmo first, then amc, then other; alphabetical inside
  const hourOrder = (h: string) => (h === "bmo" ? 0 : h === "amc" ? 1 : 2);
  byDay.forEach(list => list.sort((a, b) => hourOrder(a.hour) - hourOrder(b.hour) || a.symbol.localeCompare(b.symbol)));

  const weeks = monthWeeks(year, month);
  const totalCount = filtered.length;
  const bmoCount = filtered.filter(e => e.hour === "bmo").length;
  const amcCount = filtered.filter(e => e.hour === "amc").length;

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
          Earnings Calendar
        </h1>
        <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, margin: "0.6rem 0" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          Full-month view · Blue edge = before open · Red edge = after close · Click a ticker to research it
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button onClick={() => shiftMonth(-1)} style={navBtn}>← {new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short" })}</button>
          <span style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontWeight: 600, fontSize: "1.2rem", minWidth: 200, textAlign: "center" }}>
            {monthLabel}
          </span>
          <button onClick={() => shiftMonth(1)} style={navBtn}>{new Date(year, month + 1, 1).toLocaleDateString("en-US", { month: "short" })} →</button>
          {!isCurrentMonth && (
            <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
              style={{ ...navBtn, color: "var(--accent-gold)", borderColor: "var(--accent-gold)" }}>
              This Month
            </button>
          )}
        </div>

        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
          {(["popular", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "0.4rem 0.9rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: filter === f ? "var(--accent-gold)" : "transparent",
              color: filter === f ? "#04110A" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
              fontFamily: "'Public Sans', sans-serif",
            }}>
              {f === "popular" ? "S&P 500 + Nasdaq 100" : "All Stocks"}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ textAlign: "center", padding: "2rem", color: "var(--negative)" }}>{error}</div>}

      {/* Month grid */}
      <div style={{ opacity: loading ? 0.45 : 1, transition: "opacity 0.15s ease" }}>
        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 8 }}>
          {DAY_HEADERS.map(h => (
            <div key={h} style={{ textAlign: "center", fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)" }}>
              {h}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 8 }}>
            {week.map((d, di) => {
              if (!d) return <div key={di} style={{ background: "transparent", border: "1px dashed var(--border)", borderRadius: 14, opacity: 0.3, minHeight: 110 }} />;
              const ymd = toYMD(d);
              const entries = byDay.get(ymd) ?? [];
              const today = isToday(d);
              const isOpen = expanded.has(ymd);
              const shown = isOpen ? entries : entries.slice(0, MAX_CHIPS);
              const hidden = entries.length - shown.length;
              return (
                <div key={di} style={{
                  background: "var(--bg-surface)",
                  border: today ? "1px solid var(--accent-gold)" : "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "8px 9px",
                  minHeight: 110,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7 }}>
                    <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.85rem", fontWeight: 700, color: today ? "var(--accent-gold)" : "var(--text-primary)" }}>
                      {d.getDate()}
                    </span>
                    {today && <span style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent-gold)", textTransform: "uppercase" }}>Today</span>}
                    {entries.length > 0 && !today && (
                      <span style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "'Spline Sans Mono', monospace" }}>{entries.length}</span>
                    )}
                  </div>
                  {entries.length === 0 ? (
                    <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", textAlign: "center", paddingTop: 18 }}>—</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {shown.map(e => (
                        <Chip key={e.symbol + e.hour} entry={e} side={e.hour === "bmo" ? "bmo" : e.hour === "amc" ? "amc" : "other"} />
                      ))}
                      {hidden > 0 && (
                        <button onClick={() => setExpanded(prev => new Set(prev).add(ymd))} style={{
                          background: "transparent", border: "1px solid var(--border-active)", borderRadius: 20,
                          color: "var(--accent-gold)", fontSize: "0.65rem", padding: "0.15rem 0.4rem", cursor: "pointer",
                          fontFamily: "'Spline Sans Mono', monospace",
                        }}>
                          +{hidden}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Summary strip */}
      <div style={{ marginTop: "0.5rem", padding: "0.65rem 1rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 14, fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <span><strong style={{ color: "var(--text-primary)" }}>{totalCount}</strong> reports in {monthLabel}</span>
        <span style={{ color: "#5BD1EF" }}>▲ {bmoCount} before open</span>
        <span style={{ color: "var(--negative)" }}>▼ {amcCount} after close</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-muted)" }}>
          Filtered: {filter === "popular" ? "S&P 500 + Nasdaq 100" : "All stocks"}
        </span>
      </div>
    </div>
  );
}

export default function EarningsCalendarPage() {
  return <Suspense fallback={null}><EarningsInner /></Suspense>;
}
