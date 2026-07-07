"use client";

import { useState } from "react";

interface StockData {
  price?: number;
  companyName?: string;
  beta?: number;
  week52High?: number;
  week52Low?: number;
}

function roundToNearest5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

function blackScholesATM(price: number, iv: number, dte: number): number {
  // Simplified ATM call premium approximation
  return price * (iv / 100) * Math.sqrt(dte / 365) * 0.4;
}

function fmt(n: number | undefined | null, d = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

interface StrikeRow {
  strike: number;
  premium: number;
  yield_pct: number;
  annualized_pct: number;
  otm_pct: number;
}

function buildStrikeTable(price: number, iv: number, dte: number): StrikeRow[] {
  const atm = roundToNearest5(price);
  const strikes = [atm - 10, atm - 5, atm, atm + 5, atm + 10];
  return strikes.map(strike => {
    const moneyness = strike / price;
    // Adjust premium for OTM: approximate with scaling
    const adjustFactor = strike <= price ? 1 : Math.exp(-0.5 * Math.pow((strike - price) / (price * iv / 100 * Math.sqrt(dte / 365)), 2));
    const premium = blackScholesATM(price, iv, dte) * adjustFactor;
    const yld = (premium / price) * 100;
    const ann = yld * (365 / dte);
    const otm = ((strike - price) / price) * 100;
    return { strike, premium, yield_pct: yld, annualized_pct: ann, otm_pct: otm };
  });
}

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "0.35rem",
  display: "block",
};

export default function CoveredCallsPage() {
  const [inputTicker, setInputTicker] = useState("");
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [strikeInput, setStrikeInput] = useState("");
  const [dteInput, setDteInput] = useState("30");
  const [ivInput, setIvInput] = useState("30");

  function loadTicker() {
    const sym = inputTicker.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    fetch(`/api/stock/${sym}`)
      .then(r => r.json())
      .then(d => {
        const s = d.stock ?? {};
        const price = s.price;
        const sd: StockData = {
          price,
          companyName: s.companyName ?? s.name,
          beta:        s.beta,
          week52High:  s.week52High ?? s.yearHigh,
          week52Low:   s.week52Low  ?? s.yearLow,
        };
        setStockData(sd);
        setActiveTicker(sym);
        if (price) setStrikeInput(String(roundToNearest5(price)));
        setLoading(false);
      })
      .catch(() => { setError("Failed to load stock data."); setLoading(false); });
  }

  const price  = stockData?.price ?? 0;
  const strike = parseFloat(strikeInput) || 0;
  const dte    = parseInt(dteInput)    || 30;
  const iv     = parseFloat(ivInput)   || 30;

  const premium    = price && iv && dte ? blackScholesATM(strike || price, iv, dte) : null;
  const yld        = premium && price ? (premium / price) * 100 : null;
  const annYield   = yld && dte ? yld * (365 / dte) : null;
  const strikeRows = price && iv && dte ? buildStrikeTable(price, iv, dte) : [];

  return (
    <div style={{ fontFamily: "Inter, sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
          Covered Calls
        </h1>
        <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, margin: "0.6rem 0" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          Select stocks with high implied volatility and calculate potential premium income
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", alignItems: "flex-end" }}>
        <div style={{ width: 200 }}>
          <label style={labelStyle}>Ticker Symbol</label>
          <input
            value={inputTicker}
            onChange={e => setInputTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === "Enter" && loadTicker()}
            placeholder="Ticker"
            style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.04em" }}
          />
        </div>
        <button
          onClick={loadTicker}
          disabled={loading}
          style={{
            padding: "10px 22px",
            background: "var(--accent-gold)",
            border: "none",
            borderRadius: 4,
            color: "#0A0F1E",
            fontFamily: "Inter, sans-serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error && <div style={{ color: "var(--negative)", marginBottom: "1rem" }}>{error}</div>}

      {stockData && activeTicker && (
        <>
          {/* Stock Overview */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", marginBottom: "1rem" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.6rem", fontWeight: 700, color: "var(--accent-gold)" }}>
                {activeTicker}
              </span>
              {stockData.companyName && (
                <span style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>{stockData.companyName}</span>
              )}
              {stockData.price != null && (
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.3rem", fontWeight: 600, marginLeft: "auto" }}>
                  ${fmt(stockData.price)}
                </span>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
              {[
                { label: "Current Price", value: `$${fmt(stockData.price)}` },
                { label: "52W High",      value: `$${fmt(stockData.week52High)}` },
                { label: "52W Low",       value: `$${fmt(stockData.week52Low)}`  },
                { label: "Beta",          value: fmt(stockData.beta) },
              ].map(s => (
                <div key={s.label} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 7, padding: "0.6rem 0.8rem" }}>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{s.label}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.95rem", fontWeight: 600 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Calculator */}
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.5rem" }}>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.2rem", fontWeight: 600, margin: "0 0 1.1rem" }}>
              Covered Call Calculator
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <label style={labelStyle}>Strike Price ($)</label>
                <input value={strikeInput} onChange={e => setStrikeInput(e.target.value)} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} type="number" />
              </div>
              <div>
                <label style={labelStyle}>Days to Expiration</label>
                <input value={dteInput} onChange={e => setDteInput(e.target.value)} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} type="number" min="1" max="365" />
              </div>
              <div>
                <label style={labelStyle}>Implied Volatility (%)</label>
                <input value={ivInput} onChange={e => setIvInput(e.target.value)} style={{ ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" }} type="number" min="1" max="300" />
              </div>
            </div>

            {premium != null && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
                {[
                  { label: "Est. Premium",       value: `$${fmt(premium)}` },
                  { label: "Premium Range",       value: `$${fmt(premium * 0.85)} – $${fmt(premium * 1.15)}` },
                  { label: "Yield",               value: `${fmt(yld)}%` },
                  { label: "Annualized Yield",    value: `${fmt(annYield)}%` },
                ].map(s => (
                  <div key={s.label} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 7, padding: "0.7rem 0.9rem" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>{s.label}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Strike table */}
          {strikeRows.length > 0 && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
                  Strike Comparison Table
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.2rem 0 0" }}>
                  Based on {iv}% IV · {dte} DTE · Stock @ ${fmt(price)}
                </p>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
                      {["Strike", "OTM %", "Est. Premium", "Yield %", "Ann. Yield %"].map(h => (
                        <th key={h} style={{ padding: "0.6rem 1rem", textAlign: "right", color: "var(--text-secondary)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {strikeRows.map((row, i) => {
                      const isATM = Math.abs(row.strike - roundToNearest5(price)) < 0.01;
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: isATM ? "rgba(201,168,76,0.06)" : "transparent" }}>
                          <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: isATM ? 700 : 400, color: isATM ? "var(--accent-gold)" : "var(--text-primary)" }}>
                            ${fmt(row.strike, 0)}{isATM ? " *" : ""}
                          </td>
                          <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: row.otm_pct > 0 ? "var(--text-secondary)" : row.otm_pct < 0 ? "var(--negative)" : "var(--positive)" }}>
                            {row.otm_pct >= 0 ? "+" : ""}{fmt(row.otm_pct)}%
                          </td>
                          <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace" }}>
                            ${fmt(row.premium)}
                          </td>
                          <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: "var(--positive)" }}>
                            {fmt(row.yield_pct)}%
                          </td>
                          <td style={{ padding: "0.6rem 1rem", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: "var(--accent-gold)", fontWeight: 600 }}>
                            {fmt(row.annualized_pct)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Concept cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {[
          {
            title: "What is a Covered Call?",
            body: "A covered call is an options strategy where you hold shares of a stock and sell (write) call options on the same stock. You collect the option premium upfront as income. The buyer of the call has the right — but not the obligation — to buy your shares at the strike price before expiration.",
          },
          {
            title: "When to Use",
            body: "Best used when you have a neutral to mildly bullish outlook on a stock you already own. Ideal in sideways or slowly rising markets. Higher implied volatility (IV) means larger premiums, making it more attractive to sell calls when IV is elevated.",
          },
          {
            title: "Risk / Reward",
            body: "Your upside is capped at the strike price — if the stock surges above it, you still deliver shares at the strike. The premium provides a buffer against downside, but you still bear the full risk of stock decline. The trade-off: income now vs. potential gains foregone.",
          },
        ].map(card => (
          <div key={card.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem" }}>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 600, marginBottom: "0.6rem", color: "var(--accent-gold)" }}>
              {card.title}
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.65, margin: 0 }}>
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

