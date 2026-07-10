"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Mover {
  symbol: string;
  name: string;
  change: number;
  price: number;
  changesPercentage: number;
  exchange?: string;
}
interface SectorPerf {
  sector: string;
  averageChange: number;
  date: string;
}

function sectorTint(chg: number): string {
  // chg is a fraction-ish small number or percentage; treat as percentage value
  const intensity = Math.min(Math.abs(chg) / 2, 1); // saturate at +/-2%
  return chg >= 0
    ? `rgba(46, 213, 115, ${0.06 + intensity * 0.22})`
    : `rgba(240, 86, 74, ${0.06 + intensity * 0.22})`;
}

function MoverTable({ title, rows }: { title: string; rows: Mover[] }) {
  const th: React.CSSProperties = {
    textAlign: "right", padding: "8px 10px", fontFamily: "'Public Sans', sans-serif",
    fontSize: "0.58rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.12em",
    color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "8px 10px", borderBottom: "1px solid var(--border)",
    color: "var(--text-secondary)", whiteSpace: "nowrap", textAlign: "right",
  };
  return (
    <div style={{ flex: 1, minWidth: 300 }}>
      <div style={{
        fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
        borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.75rem",
      }}>{title}</div>
      <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.74rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-primary)" }}>
              <th style={{ ...th, textAlign: "left" }}>Ticker</th>
              <th style={{ ...th, textAlign: "left" }}>Name</th>
              <th style={th}>Price</th>
              <th style={th}>Chg %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.symbol + i} style={{ background: i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                <td style={{ ...td, textAlign: "left" }}>
                  <Link href={`/research?ticker=${r.symbol}`} style={{ color: "var(--accent-gold)", fontWeight: 700, textDecoration: "none" }}>
                    {r.symbol}
                  </Link>
                </td>
                <td style={{ ...td, textAlign: "left", fontFamily: "'Public Sans', sans-serif", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.name}
                </td>
                <td style={{ ...td, color: "var(--text-primary)" }}>${r.price != null ? r.price.toFixed(2) : "—"}</td>
                <td style={{ ...td, color: (r.changesPercentage ?? 0) >= 0 ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
                  {r.changesPercentage != null ? `${r.changesPercentage >= 0 ? "+" : ""}${r.changesPercentage.toFixed(2)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MoversPage() {
  const [data, setData] = useState<{ gainers: Mover[]; losers: Mover[]; actives: Mover[]; sectors: SectorPerf[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/movers")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError("Could not load market movers. Try again shortly."); setLoading(false); });
  }, []);

  const sectors = data?.sectors ?? [];

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "3rem" }}>
      {/* Header */}
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Market Movers
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Today&apos;s biggest gainers, losers, and most active names — plus sector performance at a glance
      </div>

      {loading && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
          Loading market data…
        </div>
      )}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {!loading && data && (
        <>
          {/* Sector heatmap */}
          {sectors.length > 0 && (
            <>
              <div style={{
                fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
                borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "1rem",
              }}>
                Sector Performance{sectors[0]?.date ? ` — ${sectors[0].date}` : ""}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: "2rem" }}>
                {sectors.map((s) => (
                  <div key={s.sector} style={{
                    background: sectorTint(s.averageChange),
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.sector}
                    </div>
                    <div style={{
                      fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.05rem", fontWeight: 600,
                      color: s.averageChange >= 0 ? "var(--positive)" : "var(--negative)",
                    }}>
                      {s.averageChange >= 0 ? "+" : ""}{s.averageChange.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Three mover columns */}
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <MoverTable title="Top Gainers" rows={data.gainers ?? []} />
            <MoverTable title="Top Losers" rows={data.losers ?? []} />
            <MoverTable title="Most Active" rows={data.actives ?? []} />
          </div>

          <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 12 }}>
            Click a ticker to open Research · Data refreshes every 15 minutes · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}
