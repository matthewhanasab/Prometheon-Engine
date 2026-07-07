"use client";

import { useState, useEffect } from "react";

const POPULAR = new Set(["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","BRK-B","JPM","V","MA","UNH","XOM","LLY","JNJ","PG","HD","MRK","ABBV","CVX","KO","PEP","COST","WMT","BAC","MCD","TMO","ORCL","CRM","ADBE","NFLX","AMD","INTC","QCOM","TXN","AMAT","INTU","CSCO","IBM","GS","MS","BLK","AXP","SPGI","LMT","RTX","CAT","HON","UPS","DE","GE","NEE","DUK","SO","SLB","COP","EOG","SHW","APD","LIN","FCX","NEM","AMT","EQIX","PLD","SPG","MDT","ABT","SYK","BSX","ISRG","GILD","REGN","VRTX","BMY","PFE","AMGN","SBUX","NKE","TGT","LOW","BKNG","GM","F","CMG","MO","PM","CL","GIS","KMB","NOW","WDAY","SNOW","PLTR","PANW","CRWD","ZS","DDOG","SHOP","TTD"]);

const DAY_NAMES = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

function getMondayOfWeek(offset: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(monday: Date): string {
  return monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function isToday(d: Date): boolean {
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

interface EarningsEntry {
  symbol: string;
  date: string;
  hour: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
}

function EarningsChip({ entry, side }: { entry: EarningsEntry; side: "bmo" | "amc" | "other" }) {
  const hasBeat = entry.epsActual != null && entry.epsEstimate != null;
  const beat = hasBeat ? entry.epsActual! >= entry.epsEstimate! : null;
  const borderColor = side === "bmo" ? "#3B82F6" : side === "amc" ? "var(--negative)" : "var(--border)";

  return (
    <a href={`/research?ticker=${entry.symbol}`} style={{ textDecoration: "none" }}>
      <div style={{
        background: "var(--bg-elevated)",
        border: `1px solid var(--border)`,
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: 5,
        padding: "0.3rem 0.45rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}>
        <span style={{ fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.73rem", letterSpacing: "0.02em", color: "var(--text-primary)" }}>
          {entry.symbol}
        </span>
        {hasBeat && (
          <span style={{ color: beat ? "var(--positive)" : "var(--negative)", fontWeight: 700, fontSize: "0.75rem" }}>
            {beat ? "▲" : "▼"}
          </span>
        )}
      </div>
    </a>
  );
}

const navBtn: React.CSSProperties = {
  padding: "0.4rem 0.8rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  cursor: "pointer",
  fontSize: "0.82rem",
  fontWeight: 500,
};

export default function EarningsCalendarPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState<"popular" | "all">("popular");
  const [data, setData] = useState<EarningsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monday = getMondayOfWeek(weekOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const from = toYMD(monday);
    const to   = toYMD(friday);
    fetch(`/api/earnings-calendar?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => { setData(d.earnings ?? []); setLoading(false); })
      .catch(() => { setError("Failed to load earnings data."); setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  const days: Date[] = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const filtered = filter === "popular"
    ? data.filter(e => POPULAR.has(e.symbol?.toUpperCase()))
    : data;

  type Bucket = { bmo: EarningsEntry[]; amc: EarningsEntry[]; other: EarningsEntry[] };
  const byDay: Record<string, Bucket> = {};
  for (const day of days) byDay[toYMD(day)] = { bmo: [], amc: [], other: [] };
  for (const e of filtered) {
    const b = byDay[e.date];
    if (!b) continue;
    if (e.hour === "bmo") b.bmo.push(e);
    else if (e.hour === "amc") b.amc.push(e);
    else b.other.push(e);
  }

  const totalBmo = filtered.filter(e => e.hour === "bmo").length;
  const totalAmc = filtered.filter(e => e.hour === "amc").length;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2rem", fontWeight: 700, margin: 0 }}>
          Earnings Calendar
        </h1>
        <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, margin: "0.6rem 0" }} />
        <p style={{ color: "var(--text-secondary)", marginTop: "0.25rem", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
          Upcoming earnings reports · Before market open &amp; after close
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>← Prev Week</button>
          <span style={{ fontWeight: 600, fontSize: "0.9rem", minWidth: 210, textAlign: "center" }}>
            Week of {formatWeekLabel(monday)}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>Next Week →</button>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, color: "var(--accent-gold)", borderColor: "var(--accent-gold)" }}>
              This Week
            </button>
          )}
        </div>

        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          {(["popular", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "0.4rem 0.9rem",
              fontSize: "0.78rem",
              fontWeight: 600,
              background: filter === f ? "var(--accent-gold)" : "transparent",
              color: filter === f ? "#0A0F1E" : "var(--text-secondary)",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}>
              {f === "popular" ? "S&P 500 + Nasdaq 100" : "All Stocks"}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>Loading earnings data…</div>}
      {error   && <div style={{ textAlign: "center", padding: "2rem", color: "var(--negative)" }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* 5-column grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.65rem" }}>
            {days.map((day, di) => {
              const key = toYMD(day);
              const b   = byDay[key];
              const today = isToday(day);
              const isEmpty = b.bmo.length + b.amc.length + b.other.length === 0;

              return (
                <div key={key} style={{
                  background: "var(--bg-surface)",
                  border: `1px solid ${today ? "var(--accent-gold)" : "var(--border)"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                  minHeight: 180,
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: "0.55rem 0.7rem",
                    borderBottom: "1px solid var(--border)",
                    background: today ? "rgba(201,168,76,0.1)" : "var(--bg-elevated)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>{DAY_NAMES[di]}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        {day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    {today && (
                      <span style={{ background: "var(--accent-gold)", color: "#0A0F1E", fontSize: "0.62rem", fontWeight: 800, padding: "0.12rem 0.4rem", borderRadius: 4, letterSpacing: "0.06em" }}>
                        TODAY
                      </span>
                    )}
                  </div>

                  {/* Tickers */}
                  <div style={{ padding: "0.5rem 0.5rem 0.6rem" }}>
                    {isEmpty ? (
                      <p style={{ color: "var(--text-muted, #4B5563)", fontSize: "0.75rem", textAlign: "center", padding: "1rem 0", margin: 0 }}>
                        No reports
                      </p>
                    ) : (
                      <>
                        {(b.bmo.length > 0 || b.other.length > 0) && (
                          <div style={{ marginBottom: "0.5rem" }}>
                            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--positive)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.3rem" }}>
                              Before Open · {b.bmo.length + b.other.length}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                              {[...b.bmo, ...b.other].map((e, i) => <EarningsChip key={i} entry={e} side="bmo" />)}
                            </div>
                          </div>
                        )}
                        {b.amc.length > 0 && (
                          <div>
                            <div style={{ fontSize: "0.65rem", fontWeight: 700, color: "var(--negative)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.3rem" }}>
                              After Close · {b.amc.length}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                              {b.amc.map((e, i) => <EarningsChip key={i} entry={e} side="amc" />)}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ marginTop: "1rem", padding: "0.65rem 1rem", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: "0.8rem", color: "var(--text-secondary)", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span><strong style={{ color: "var(--text-primary)" }}>{filtered.length}</strong> companies this week</span>
            <span style={{ color: "var(--positive)" }}>▲ {totalBmo} before open</span>
            <span style={{ color: "var(--negative)" }}>▼ {totalAmc} after close</span>
            {filter === "popular" && <span style={{ marginLeft: "auto", fontSize: "0.75rem" }}>Filtered: S&P 500 + Nasdaq 100</span>}
          </div>
        </>
      )}
    </div>
  );
}
