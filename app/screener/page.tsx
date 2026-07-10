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
  { label: "Micro (<$300M)", min: "", max: "300000000" },
  { label: "Small ($300M–$2B)", min: "300000000", max: "2000000000" },
  { label: "Mid ($2B–$10B)", min: "2000000000", max: "10000000000" },
  { label: "Large ($10B–$200B)", min: "10000000000", max: "200000000000" },
  { label: "Mega (>$200B)", min: "200000000000", max: "" },
];

// ─── shared styles ────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "'Spline Sans Mono', monospace",
  fontSize: "0.8rem",
  outline: "none",
  width: "100%",
};

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Public Sans', sans-serif",
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
  price: number;
  beta: number | null;
  pe: number | null;
  ps: number | null;
  pb: number | null;
  de: number | null;
  netMargin: number | null;
  grossMargin: number | null;
  divYield: number | null;
  currentRatio: number | null;
}

interface Filters {
  sector: string;
  capIdx: number;
  minPrice: string;
  maxPrice: string;
  maxBeta: string;
  minPE: string;
  maxPE: string;
  maxPS: string;
  maxPB: string;
  maxDE: string;
  minNetMargin: string;
  minGrossMargin: string;
  minDivYield: string;
  minCurrentRatio: string;
}

const EMPTY_FILTERS: Filters = {
  sector: "", capIdx: 0, minPrice: "", maxPrice: "", maxBeta: "",
  minPE: "", maxPE: "", maxPS: "", maxPB: "", maxDE: "",
  minNetMargin: "", minGrossMargin: "", minDivYield: "", minCurrentRatio: "",
};

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type="number"
        placeholder={placeholder ?? ""}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={INPUT_STYLE}
      />
    </div>
  );
}

export default function ScreenerPage() {
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  function set<K extends keyof Filters>(key: K, val: Filters[K]) {
    setF(prev => ({ ...prev, [key]: val }));
  }

  async function handleScreen() {
    setLoading(true);
    setRan(true);
    try {
      const cap = MARKET_CAPS[f.capIdx];
      const params = new URLSearchParams();
      if (f.sector) params.set("sector", f.sector);
      if (cap.min) params.set("minMarketCap", cap.min);
      if (cap.max) params.set("maxMarketCap", cap.max);
      if (f.minPrice) params.set("minPrice", f.minPrice);
      if (f.maxPrice) params.set("maxPrice", f.maxPrice);
      if (f.maxBeta) params.set("maxBeta", f.maxBeta);
      if (f.minPE) params.set("minPE", f.minPE);
      if (f.maxPE) params.set("maxPE", f.maxPE);
      if (f.maxPS) params.set("maxPS", f.maxPS);
      if (f.maxPB) params.set("maxPB", f.maxPB);
      if (f.maxDE) params.set("maxDE", f.maxDE);
      if (f.minNetMargin) params.set("minNetMargin", f.minNetMargin);
      if (f.minGrossMargin) params.set("minGrossMargin", f.minGrossMargin);
      if (f.minDivYield) params.set("minDivYield", f.minDivYield);
      if (f.minCurrentRatio) params.set("minCurrentRatio", f.minCurrentRatio);
      const res = await fetch(`/api/screener?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  const cellR: React.CSSProperties = { padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <h1
        style={{
          fontFamily: "'Space Grotesk', Georgia, serif",
          fontSize: "1.75rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: "0.35rem",
        }}
      >
        Stock Screener
      </h1>
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, var(--accent-gold), transparent)",
          opacity: 0.45,
          maxWidth: 200,
          marginBottom: "0.9rem",
        }}
      />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
        Set any combination of filters and hit Screen — empty fields are ignored
      </div>

      {/* Filter panel */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "20px 20px 16px",
          marginBottom: "1.5rem",
        }}
      >
        {/* Row 1: universe */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px 18px", marginBottom: 16 }}>
          <div>
            <label style={LABEL_STYLE}>Sector</label>
            <select value={f.sector} onChange={(e) => set("sector", e.target.value)} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
              <option value="">All Sectors</option>
              {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={LABEL_STYLE}>Market Cap</label>
            <select value={f.capIdx} onChange={(e) => set("capIdx", Number(e.target.value))} style={{ ...INPUT_STYLE, cursor: "pointer" }}>
              {MARKET_CAPS.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
            </select>
          </div>
          <Field label="Min Price ($)" value={f.minPrice} onChange={(v) => set("minPrice", v)} placeholder="5" />
          <Field label="Max Price ($)" value={f.maxPrice} onChange={(v) => set("maxPrice", v)} placeholder="500" />
          <Field label="Max Beta" value={f.maxBeta} onChange={(v) => set("maxBeta", v)} placeholder="1.5" />
        </div>

        {/* Row 2: valuation */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px 18px", marginBottom: 16 }}>
          <Field label="Min P/E" value={f.minPE} onChange={(v) => set("minPE", v)} placeholder="5" />
          <Field label="Max P/E" value={f.maxPE} onChange={(v) => set("maxPE", v)} placeholder="30" />
          <Field label="Max P/S" value={f.maxPS} onChange={(v) => set("maxPS", v)} placeholder="10" />
          <Field label="Max P/B" value={f.maxPB} onChange={(v) => set("maxPB", v)} placeholder="5" />
          <Field label="Max Debt/Equity" value={f.maxDE} onChange={(v) => set("maxDE", v)} placeholder="1" />
        </div>

        {/* Row 3: quality + income */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px 18px", marginBottom: 18 }}>
          <Field label="Min Net Margin (%)" value={f.minNetMargin} onChange={(v) => set("minNetMargin", v)} placeholder="10" />
          <Field label="Min Gross Margin (%)" value={f.minGrossMargin} onChange={(v) => set("minGrossMargin", v)} placeholder="40" />
          <Field label="Min Div Yield (%)" value={f.minDivYield} onChange={(v) => set("minDivYield", v)} placeholder="2" />
          <Field label="Min Current Ratio" value={f.minCurrentRatio} onChange={(v) => set("minCurrentRatio", v)} placeholder="1" />
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <button
              onClick={handleScreen}
              disabled={loading}
              style={{
                flex: 1,
                background: "var(--accent-gold)",
                color: "#131C2E",
                border: "none",
                borderRadius: 4,
                padding: "10px 24px",
                fontFamily: "'Public Sans', sans-serif",
                fontSize: "0.72rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Screening…" : "Screen"}
            </button>
            <button
              onClick={() => setF(EMPTY_FILTERS)}
              style={{
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "10px 14px",
                fontFamily: "'Public Sans', sans-serif",
                fontSize: "0.72rem",
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div style={{ color: "var(--text-secondary)", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.8rem", padding: "40px 0", textAlign: "center" }}>
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
            fontSize: "0.85rem",
          }}
        >
          No results found for the selected filters. Try broadening your criteria.
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: 8 }}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.78rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-primary)" }}>
                  {["Ticker", "Company", "Sector", "Mkt Cap", "Price", "P/E", "P/S", "P/B", "D/E", "Net Mgn", "Div Yld", "Beta"].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 0 ? "left" : "right",
                        padding: "10px 12px",
                        fontFamily: "'Public Sans', sans-serif",
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
                  <tr key={r.symbol} style={{ background: ri % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      <Link
                        href={`/research?ticker=${r.symbol}`}
                        style={{
                          fontFamily: "'Spline Sans Mono', monospace",
                          fontWeight: 700,
                          color: "var(--accent-gold)",
                          textDecoration: "none",
                          fontSize: "0.82rem",
                        }}
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", whiteSpace: "nowrap", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.companyName ?? "N/A"}
                    </td>
                    <td style={cellR}>{r.sector ?? "N/A"}</td>
                    <td style={cellR}>{fmtLarge(r.marketCap)}</td>
                    <td style={{ ...cellR, color: "var(--text-primary)", fontWeight: 600 }}>{r.price != null ? `$${fmt(r.price)}` : "N/A"}</td>
                    <td style={cellR}>{r.pe != null && r.pe > 0 ? `${fmt(r.pe)}×` : "N/A"}</td>
                    <td style={cellR}>{r.ps != null && r.ps > 0 ? `${fmt(r.ps)}×` : "N/A"}</td>
                    <td style={cellR}>{r.pb != null && r.pb > 0 ? `${fmt(r.pb)}×` : "N/A"}</td>
                    <td style={cellR}>{r.de != null ? `${fmt(r.de)}×` : "N/A"}</td>
                    <td style={{ ...cellR, color: r.netMargin != null ? (r.netMargin >= 0 ? "var(--positive)" : "var(--negative)") : "var(--text-secondary)" }}>
                      {r.netMargin != null ? fmtPct(r.netMargin) : "N/A"}
                    </td>
                    <td style={cellR}>{r.divYield != null && r.divYield > 0 ? fmtPct(r.divYield) : "—"}</td>
                    <td style={cellR}>{r.beta != null ? fmt(r.beta) : "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "0.62rem", color: "var(--text-secondary)", marginTop: 8 }}>
            Click a ticker to open Research · Not financial advice
          </div>
        </>
      )}
    </div>
  );
}
