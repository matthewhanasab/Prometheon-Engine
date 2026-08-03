"use client";
import { useState, Suspense } from "react";

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 22,
};

function MarketStackInner() {
  const [input, setInput] = useState("AAPL");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(sym?: string) {
    const t = (sym ?? input).trim().toUpperCase();
    if (!t) return;
    setInput(t);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/marketstack-lookup/${t}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "Request failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        fontFamily: "'Public Sans', sans-serif",
        color: "var(--text-primary)",
        paddingBottom: "4rem",
      }}
    >
      <h1
        style={{
          fontFamily: "'Space Grotesk', Georgia, serif",
          fontSize: "1.75rem",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          margin: "0 0 0.4rem",
        }}
      >
        Marketstack Explorer
      </h1>
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, var(--accent-gold), transparent)",
          opacity: 0.4,
          maxWidth: 200,
          marginBottom: "1rem",
        }}
      />
      <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Free tier preview — 100 requests/month, capped at ~1 year history. Search any ticker to see
        live data from <strong>marketstack</strong>.
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        style={{ display: "flex", gap: 10, maxWidth: 380, marginBottom: "1rem" }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          placeholder="Ticker (e.g., AAPL, SPY)"
          style={{
            flex: 1,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 22,
            padding: "10px 14px",
            color: "var(--text-primary)",
            fontFamily: "'Spline Sans Mono', monospace",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            background: "var(--accent-gold)",
            color: "var(--on-accent)",
            border: "none",
            borderRadius: 22,
            padding: "10px 22px",
            fontFamily: "'Public Sans', sans-serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading…" : "Search"}
        </button>
      </form>

      {error && (
        <div style={{ color: "var(--negative)", fontSize: "0.85rem", marginBottom: "1rem" }}>
          ❌ {error}
        </div>
      )}

      {data && (
        <>
          {/* Header Card */}
          <div
            style={{
              ...CARD,
              padding: "20px 24px",
              marginBottom: "1.4rem",
              display: "flex",
              alignItems: "flex-end",
              gap: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'Space Grotesk', Georgia, serif",
                  fontSize: "1.4rem",
                  fontWeight: 600,
                  letterSpacing: "-0.02em",
                  marginBottom: 4,
                }}
              >
                {data.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {data.exchange} • {data.assetType}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                ${Number(data.latestClose).toFixed(2)}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                {data.latestDate}
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(140px, 44vw), 1fr))",
              gap: 10,
              marginBottom: "1.4rem",
            }}
          >
            <div style={{ ...CARD, padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.56rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Rows Available
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 600,
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                {data.rowCount}
              </div>
            </div>
            <div style={{ ...CARD, padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.56rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Data Span
              </div>
              <div
                style={{
                  fontSize: "0.85rem",
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                {data.oldestDate}
              </div>
            </div>
            <div style={{ ...CARD, padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.56rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Dividends
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 600,
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                {data.dividendCount}
              </div>
            </div>
            <div style={{ ...CARD, padding: "12px 16px" }}>
              <div
                style={{
                  fontSize: "0.56rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--text-secondary)",
                  marginBottom: 4,
                }}
              >
                Splits
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 600,
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                {data.splitCount}
              </div>
            </div>
          </div>

          {/* Recent Data Table */}
          <div style={{ marginBottom: "1.4rem" }}>
            <div
              style={{
                fontSize: "0.58rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: "var(--text-secondary)",
                marginBottom: "0.8rem",
              }}
            >
              Last 20 Trading Days
            </div>
            <div style={{ ...CARD, padding: "6px 0", overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "0.75rem",
                  fontFamily: "'Spline Sans Mono', monospace",
                }}
              >
                <thead>
                  <tr
                    style={{
                      color: "var(--text-secondary)",
                      fontFamily: "'Public Sans', sans-serif",
                      fontSize: "0.56rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>
                      Date
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>
                      Close
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>
                      Volume
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 12px", fontWeight: 600 }}>
                      Div / Split
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows?.map((row: any) => (
                    <tr key={row.date} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "6px 12px", color: "var(--text-secondary)" }}>
                        {row.date}
                      </td>
                      <td style={{ padding: "6px 12px", textAlign: "right" }}>
                        ${Number(row.close).toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: "6px 12px",
                          textAlign: "right",
                          color: "var(--text-muted)",
                        }}
                      >
                        {row.volume ? `${(row.volume / 1e6).toFixed(1)}M` : "—"}
                      </td>
                      <td
                        style={{
                          padding: "6px 12px",
                          textAlign: "right",
                          color: "var(--text-muted)",
                          fontSize: "0.7rem",
                        }}
                      >
                        {row.dividend > 0 ? `$${row.dividend}` : ""}
                        {row.split !== 1 ? ` ${row.split}:1` : ""}
                        {row.dividend === 0 && row.split === 1 ? "—" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {data.tier && (
            <div
              style={{
                ...CARD,
                padding: "10px 14px",
                fontSize: "0.7rem",
                color: "var(--text-muted)",
              }}
            >
              ℹ Free tier: 100 req/mo, ~1yr history. {data.tier} plan needed for full depth.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MarketStackPage() {
  return <Suspense fallback={null}><MarketStackInner /></Suspense>;
}
