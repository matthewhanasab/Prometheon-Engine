"use client";
import { useEffect, useState } from "react";

// Index levels and 10-year yields from /api/markets, shared by the macro and
// movers pages.
type IndexQuote = {
  code: string; label: string; price: number;
  changeDay: number | null; pctDay: number | null;
  pctWeek: number | null; pctMonth: number | null; pctYear: number | null;
  date: string | null;
};
type BondQuote = {
  label: string; tenor: string; yieldPct: number;
  changeDay: number | null; pctWeek: number | null; pctMonth: number | null; pctYear: number | null;
  date: string | null;
};
type Payload = { indices: IndexQuote[]; bonds: BondQuote[] };

const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

const fmtLevel = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number | null, d = 2, suffix = "%") =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(d)}${suffix}`;
const tone = (n: number | null) => n == null ? "var(--text-muted)" : n >= 0 ? "var(--positive)" : "var(--negative)";

export default function MarketStrip({ showBonds = true }: { showBonds?: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/markets")
      .then((r) => r.json())
      .then((j) => { if (alive) setData({ indices: j?.indices ?? [], bonds: j?.bonds ?? [] }); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;
  if (!data) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height: 86, borderRadius: 22 }} />
        ))}
      </div>
    );
  }
  if (!data.indices.length && !data.bonds.length) return null;

  return (
    <div>
      {data.indices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {data.indices.map((ix) => (
            <div key={ix.code} style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
              borderTop: `2px solid ${tone(ix.pctDay)}`, padding: "12px 14px", minWidth: 0,
            }}>
              <div style={{ fontFamily: SANS, fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)" }}>
                {ix.label}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4, color: "var(--text-primary)" }}>
                {fmtLevel(ix.price)}
              </div>
              <div style={{ fontFamily: MONO, fontSize: "0.72rem", fontWeight: 600, color: tone(ix.pctDay), marginTop: 2 }}>
                {signed(ix.pctDay)} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>today</span>
              </div>
              <div style={{ display: "flex", gap: 8, fontFamily: MONO, fontSize: "0.58rem", color: "var(--text-muted)", marginTop: 6, flexWrap: "wrap" }}>
                <span>W <span style={{ color: tone(ix.pctWeek) }}>{signed(ix.pctWeek, 1)}</span></span>
                <span>M <span style={{ color: tone(ix.pctMonth) }}>{signed(ix.pctMonth, 1)}</span></span>
                <span>Y <span style={{ color: tone(ix.pctYear) }}>{signed(ix.pctYear, 1)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showBonds && data.bonds.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
          <span style={{ fontFamily: SANS, fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginRight: 4 }}>
            10-year yields
          </span>
          {data.bonds.map((b) => (
            <span key={b.label} title={b.date ? `as of ${b.date}` : undefined} style={{
              display: "inline-flex", alignItems: "baseline", gap: 6, padding: "5px 12px",
              background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999,
            }}>
              <span style={{ fontFamily: SANS, fontSize: "0.64rem", fontWeight: 600, color: "var(--text-secondary)" }}>{b.label}</span>
              <span style={{ fontFamily: MONO, fontSize: "0.74rem", fontWeight: 700, color: "var(--text-primary)" }}>{b.yieldPct.toFixed(2)}%</span>
              {b.changeDay != null && (
                <span style={{ fontFamily: MONO, fontSize: "0.6rem", color: tone(b.changeDay) }}>{signed(b.changeDay, 2, "")}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
