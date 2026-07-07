"use client";

import { useState } from "react";
import Link from "next/link";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtLarge(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(dec);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

// ─── constants ───────────────────────────────────────────────────────────────

const SECTORS = [
  "Technology",
  "Healthcare",
  "Financial Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Industrials",
  "Utilities",
  "Real Estate",
  "Materials",
  "Communication Services",
];

const MARKET_CAPS = [
  { label: "Any", min: "", max: "" },
  { label: "Small (<$2B)", min: "", max: "2000000000" },
  { label: "Mid ($2B–$10B)", min: "2000000000", max: "10000000000" },
  { label: "Large (>$10B)", min: "10000000000", max: "" },
];

// ─── shared styles ────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: "0.8rem",
  outline: "none",
  width: "100%",
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "Inter, sans-serif",
  fontSize: "0.58rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color: "var(--text-secondary)",
  marginBottom: 4,
  display: "block",
};

// ─── page ────────────────────────────────────────────────────────────────────

interface ScreenerResult {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number;
  pe: number | null;
  ps: number | null;
  netMargin: number | null;
  beta: number | null;
  price: number;
}

export default function ScreenerPage() {
  const [sector, setSector] = useState("");
  const [capIdx, setCapIdx] = useState(0);
  const [minPE, setMinPE] = useState("");
  const [maxPE, setMaxPE] = useState("");
  const [minNetMargin, setMinNetMargin] = useState("");
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function handleScreen() {
    setLoading(true);
    setRan(true);
    try {
      const cap = MARKET_CAPS[capIdx];
      const params = new URLSearchParams();
      if (sector) params.set("sector", sector);
      if (cap.min) params.set("minMarketCap", cap.min);
      if (cap.max) params.set("maxMarketCap", cap.max);
      if (minPE) params.set("minPE", minPE);
      if (maxPE) params.set("maxPE", maxPE);
      if (minNetMargin) params.set("minNetMargin", minNetMargin);
      const res = await fetch(`/api/screener?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ fontFamily: "Inter, sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <h1
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: "1.75rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: "0.35rem",
        }}
      >
        Stock Screener
      </h1>
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.9rem" }}>
        Filter stocks by sector, market cap, valuation, and profitability
      </div>
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, var(--accent-gold), transparent)",
          opacity: 0.45,
          maxWidth: 300,
          marginBottom: "1.5rem",
        }}
      />

      {/* Filter panel */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "20px 20px 16px",
          marginBottom: "1.5rem",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr) auto",
          gap: "16px 20px",
          alignItems: "end",
        }}
      >
        {/* Sector */}
        <div>
          <label style={LABEL_STYLE}>Sector</label>
          <select
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            style={{ ...INPUT_STYLE, cursor: "pointer" }}
          >
            <option value="">All Sectors</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Market Cap */}
        <div>
          <label style={LABEL_STYLE}>Market Cap</label>
          <select
            value={capIdx}
            onChange={(e) => setCapIdx(Number(e.target.value))}
            style={{ ...INPUT_STYLE, cursor: "pointer" }}
          >
            {MARKET_CAPS.map((c, i) => (
              <option key={i} value={i}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Min Net Margin */}
        <div>
          <label style={LABEL_STYLE}>Min Net Margin (%)</label>
          <input
            type="number"
            placeholder="e.g. 10"
            value={minNetMargin}
            onChange={(e) => setMinNetMargin(e.target.value)}
            style={INPUT_STYLE}
          />
        </div>

        {/* P/E range */}
        <div style={{ display: "flex", gap: 8, alignItems: "end", gridColumn: "span 1" }}>
          <div style={{ flex: 1 }}>
            <label style={LABEL_STYLE}>Min P/E</label>
            <input
              type="number"
              placeholder="e.g. 5"
              value={minPE}
              onChange={(e) => setMinPE(e.target.value)}
              style={INPUT_STYLE}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={LABEL_STYLE}>Max P/E</label>
            <input
              type="number"
              placeholder="e.g. 30"
              value={maxPE}
              onChange={(e) => setMaxPE(e.target.value)}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        {/* Screen button */}
        <div style={{ gridColumn: "span 3", display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleScreen}
            disabled={loading}
            style={{
              background: "var(--accent-gold)",
              color: "#17120E",
              border: "none",
              borderRadius: 4,
              padding: "10px 28px",
              fontFamily: "Inter, sans-serif",
              fontSize: "0.78rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Screening…" : "Screen"}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "IBM Plex Mono, monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
          Screening stocks…
        </div>
      )}

      {!loading && ran && results.length === 0 && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "48px",
            textAlign: "center",
            color: "var(--text-secondary)",
            fontFamily: "Inter, sans-serif",
            fontSize: "0.85rem",
          }}
        >
          No results found for the selected filters. Try broadening your criteria.
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 8 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  {["Ticker", "Company", "Sector", "Market Cap", "P/E", "P/S", "Net Margin", "Beta", "Price"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? "left" : "right",
                        padding: "10px 14px",
                        fontFamily: "Inter, sans-serif",
                        fontSize: "0.58rem",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.12em",
                        color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, ri) => (
                  <tr
                    key={r.symbol}
                    style={{
                      background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/research?ticker=${r.symbol}`}
                        style={{
                          fontFamily: "IBM Plex Mono, monospace",
                          fontWeight: 700,
                          color: "var(--accent-gold)",
                          textDecoration: "none",
                          fontSize: "0.82rem",
                        }}
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.companyName ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.sector ?? "—"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {fmtLarge(r.marketCap)}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.pe != null && r.pe > 0 ? `${fmt(r.pe)}×` : "N/A"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.ps != null && r.ps > 0 ? `${fmt(r.ps)}×` : "N/A"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" }}>
                      <span style={{ color: r.netMargin != null ? (r.netMargin >= 0 ? "var(--positive)" : "var(--negative)") : "var(--text-secondary)" }}>
                        {r.netMargin != null ? fmtPct(r.netMargin) : "N/A"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                      {r.beta != null ? fmt(r.beta) : "N/A"}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>
                      {r.price != null ? `$${fmt(r.price)}` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 8, fontFamily: "Inter, sans-serif" }}>
            Click a ticker to open Research · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}
