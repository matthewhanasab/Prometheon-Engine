"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

// ─── Black-Scholes ────────────────────────────────────────────────────────────

function normCdf(x: number): number {
  // Abramowitz-Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

function normPdf(x: number): number {
  return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
}

function bsD1(S: number, K: number, T: number, r: number, sigma: number) {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function bsCall(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0 || sigma <= 0) return Math.max(S - K, 0);
  const d1 = bsD1(S, K, T, r, sigma);
  const d2 = d1 - sigma * Math.sqrt(T);
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

function bsDelta(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0 || sigma <= 0) return S > K ? 1 : 0;
  return normCdf(bsD1(S, K, T, r, sigma));
}

function bsTheta(S: number, K: number, T: number, r: number, sigma: number) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1 = bsD1(S, K, T, r, sigma);
  const d2 = d1 - sigma * Math.sqrt(T);
  return ((-(S * normPdf(d1) * sigma) / (2 * Math.sqrt(T))) - r * K * Math.exp(-r * T) * normCdf(d2)) / 365;
}

// ─── formatting ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// ─── types ────────────────────────────────────────────────────────────────────

interface CCData {
  ticker: string;
  name: string;
  price: number;
  week52High: number | null;
  week52Low: number | null;
  hv21: number | null;
  hvRank: number | null;
  rfr: number;
  nextEarnings: string | null;
}

interface ContractRow {
  strike: number;
  otmPct: number;
  premium: number;
  delta: number;
  theta: number;
  annYield: number;
  probProfit: number;
  maxProfit: number;
  breakeven: number;
  netIfAssigned: number | null;
  roiOnBasis: number | null;
  score: number;
}

type Strategy = "balanced" | "maxYield" | "safest";

const DTE_OPTIONS = [21, 30, 45, 60, 90];

// ─── styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text-primary)",
  fontSize: "0.85rem",
  fontFamily: "'IBM Plex Mono', monospace",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.58rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: "0.35rem",
  display: "block",
  fontFamily: "'IBM Plex Sans', sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "1.1rem 1.25rem",
};

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "gold" }) {
  const subColor = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "gold" ? "var(--accent-gold)" : "var(--text-secondary)";
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "12px 14px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.65rem", color: subColor, marginTop: 4, fontFamily: "'IBM Plex Sans', sans-serif" }}>{sub}</div>}
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

function CoveredCallsInner() {
  const searchParams = useSearchParams();
  const [inputTicker, setInputTicker] = useState("");
  const [data, setData] = useState<CCData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Position + strategy inputs
  const [shares, setShares] = useState("100");
  const [costBasis, setCostBasis] = useState("");
  const [dte, setDte] = useState(30);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [deltaMin, setDeltaMin] = useState("0.15");
  const [deltaMax, setDeltaMax] = useState("0.40");

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInputTicker(t.toUpperCase()); load(t.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load(symArg?: string) {
    const sym = (symArg ?? inputTicker).trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    fetch(`/api/covered-calls/${sym}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load stock data. Check the ticker."); setLoading(false); });
  }

  // ── Screen contracts (live-computed from inputs) ──
  const S = data?.price ?? 0;
  const iv = data?.hv21 ?? 0.3;
  const rfr = data?.rfr ?? 0.045;
  const numShares = Math.max(100, parseInt(shares) || 100);
  const contracts = Math.floor(numShares / 100);
  const basis = parseFloat(costBasis) || 0;
  const dMin = parseFloat(deltaMin) || 0.05;
  const dMax = parseFloat(deltaMax) || 0.7;
  const T = dte / 365;

  const expiryDate = new Date(Date.now() + dte * 86400000);
  const earningsBeforeExpiry = !!(data?.nextEarnings &&
    new Date(data.nextEarnings) <= expiryDate &&
    new Date(data.nextEarnings) >= new Date());

  let rows: ContractRow[] = [];
  if (S > 0 && iv > 0) {
    // Strike grid: just OTM to +30%, sensible increments
    const inc = S < 25 ? 0.5 : S < 100 ? 2.5 : S < 250 ? 5 : 10;
    const strikes: number[] = [];
    let k = Math.ceil(S / inc) * inc;
    if (k <= S) k += inc;
    while (k <= S * 1.3) { strikes.push(k); k += inc; }

    rows = strikes.map((K): ContractRow | null => {
      const premium = bsCall(S, K, T, rfr, iv);
      const delta = bsDelta(S, K, T, rfr, iv);
      if (delta < dMin || delta > dMax || premium < 0.01) return null;
      const theta = bsTheta(S, K, T, rfr, iv);
      const annYield = (premium / S) * (365 / dte) * 100;
      const probProfit = (1 - delta) * 100;
      const maxProfit = premium * 100 * contracts;
      const breakeven = S - premium;
      const netIfAssigned = basis > 0 ? K - basis + premium : null;
      const roiOnBasis = basis > 0 && netIfAssigned != null ? (netIfAssigned / basis) * 100 : null;

      let score: number;
      if (strategy === "maxYield") score = annYield;
      else if (strategy === "safest") score = (1 - delta) * 10 + Math.abs(theta) * 100;
      else score = annYield * 0.5 + Math.abs(theta) * 100 * 0.3 + (1 - delta) * 10 * 0.2;

      return {
        strike: K, otmPct: ((K - S) / S) * 100, premium, delta, theta,
        annYield, probProfit, maxProfit, breakeven, netIfAssigned, roiOnBasis, score,
      };
    }).filter((r): r is ContractRow => r !== null)
      .sort((a, b) => b.score - a.score);
  }

  const best = rows[0] ?? null;

  // Payoff curve for best contract
  const payoffData = best && S > 0
    ? Array.from({ length: 80 }, (_, i) => {
        const px = S * 0.75 + (S * 0.55 * i) / 79;
        const pnl = px >= best.strike
          ? (best.strike - S) * numShares + best.premium * 100 * contracts
          : (px - S) * numShares + best.premium * 100 * contracts;
        return { px: Math.round(px * 100) / 100, pnl: Math.round(pnl) };
      })
    : [];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: 0 }}>
          Covered Calls Screener
        </h1>
        <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, margin: "0.6rem 0" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0.25rem 0 0" }}>
          Enter your position — every strike gets scored and ranked for your strategy
        </p>
      </div>

      {/* Position form */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px 18px", marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>Ticker</label>
            <input value={inputTicker} onChange={e => setInputTicker(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && load()} placeholder="Ticker" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Shares Owned</label>
            <input type="number" min={100} step={100} value={shares} onChange={e => setShares(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Cost Basis / Share ($)</label>
            <input type="number" placeholder="optional" value={costBasis} onChange={e => setCostBasis(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Target Expiration</label>
            <select value={dte} onChange={e => setDte(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
              {DTE_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Delta Min</label>
            <input type="number" step={0.05} min={0.05} max={0.7} value={deltaMin} onChange={e => setDeltaMin(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Delta Max</label>
            <input type="number" step={0.05} min={0.05} max={0.7} value={deltaMax} onChange={e => setDeltaMax(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={labelStyle}>Strategy</label>
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
              {([["balanced", "Balanced"], ["maxYield", "Max Yield"], ["safest", "Safest"]] as [Strategy, string][]).map(([key, label]) => (
                <button key={key} onClick={() => setStrategy(key)} style={{
                  padding: "0.5rem 1rem", fontSize: "0.72rem", fontWeight: 600, border: "none", cursor: "pointer",
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  background: strategy === key ? "var(--accent-gold)" : "transparent",
                  color: strategy === key ? "#131C2E" : "var(--text-secondary)",
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => load()} disabled={loading} style={{
            padding: "10px 28px", background: "var(--accent-gold)", border: "none", borderRadius: 4,
            color: "#131C2E", fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.72rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Screening…" : "Screen Options"}
          </button>
          <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
            Strategy, deltas, shares &amp; basis re-rank instantly — no reload needed.
          </span>
        </div>
      </div>

      {error && <div style={{ color: "var(--negative)", marginBottom: "1rem", fontSize: "0.85rem" }}>{error}</div>}

      {!data && !loading && !error && (
        <div style={{ border: "1px dashed var(--border-active)", borderRadius: 4, background: "var(--bg-surface)", padding: "40px 20px", textAlign: "center", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
            Ranked contract table · best-pick summary · payoff diagram · earnings-risk flags — enter a ticker above to begin.
          </span>
        </div>
      )}

      {data && (
        <>
          {/* Earnings warning */}
          {earningsBeforeExpiry && (
            <div style={{ background: "rgba(212,180,94,0.08)", border: "1px solid rgba(212,180,94,0.3)", borderRadius: 4, padding: "10px 16px", marginBottom: "1.25rem", fontSize: "0.8rem", color: "var(--accent-gold)" }}>
              ⚠ <strong>Earnings {data.nextEarnings}</strong> falls before your {expiryDate.toISOString().slice(0, 10)} expiry — selling calls through earnings carries gap risk.
            </div>
          )}

          {/* Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
            <Metric label={data.ticker} value={`$${fmt(data.price)}`} sub={data.name.slice(0, 26)} />
            <Metric label="Est. IV (21d HV)" value={data.hv21 != null ? `${(data.hv21 * 100).toFixed(1)}%` : "—"}
              sub={data.hvRank != null ? `Vol rank ${data.hvRank.toFixed(0)}/100 ${data.hvRank >= 50 ? "· premium rich" : "· premium thin"}` : undefined}
              tone={data.hvRank != null && data.hvRank >= 50 ? "good" : undefined} />
            <Metric label="Expiry Target" value={expiryDate.toISOString().slice(0, 10)} sub={`${dte} days out`} />
            <Metric label="Next Earnings" value={data.nextEarnings ?? "—"}
              sub={earningsBeforeExpiry ? "Before expiry" : "After expiry"} tone={earningsBeforeExpiry ? "bad" : "good"} />
            <Metric label="Position" value={`${numShares.toLocaleString()} sh`} sub={`${contracts} contract${contracts !== 1 ? "s" : ""}${basis > 0 ? ` · basis $${fmt(basis)}` : ""}`} />
            <Metric label="Risk-Free Rate" value={`${(rfr * 100).toFixed(2)}%`} sub="FRED 3M Treasury" />
          </div>

          {/* Best pick */}
          {best && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-gold)", borderRadius: 4, padding: "16px 20px", marginBottom: "1.5rem" }}>
              <div style={{ ...labelStyle, color: "var(--accent-gold)" }}>⭐ Best Pick — {strategy === "maxYield" ? "Max Yield" : strategy === "safest" ? "Safest" : "Balanced"}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.3rem", fontWeight: 700, marginBottom: 6 }}>
                Sell the ${best.strike} call · collect ~${Math.round(best.maxProfit).toLocaleString()} upfront
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {best.probProfit.toFixed(0)}% chance of keeping the full premium · breakeven falls to ${fmt(best.breakeven)} ·
                upside capped at ${Math.round((best.strike - S) * numShares + best.maxProfit).toLocaleString()} if called away
                {best.roiOnBasis != null ? ` · ${best.roiOnBasis.toFixed(1)}% return on your cost basis if assigned` : ""}
                {earningsBeforeExpiry ? " · ⚠ earnings before expiry" : ""}
              </div>
            </div>
          )}

          {/* Contracts table */}
          {rows.length > 0 ? (
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 4, marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-primary)" }}>
                    {["Rank", "Strike", "OTM %", "Est. Premium", "Delta", "Theta $/day", "Ann. Yield", "Prob. Profit", "Breakeven", "Max Premium", basis > 0 ? "ROI on Basis" : null].filter(Boolean).map((h, i) => (
                      <th key={h as string} style={{
                        textAlign: i === 0 ? "left" : "right", padding: "9px 12px",
                        fontFamily: "'IBM Plex Sans', sans-serif", fontSize: "0.58rem", fontWeight: 500,
                        textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)",
                        borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const cell: React.CSSProperties = { padding: "8px 12px", textAlign: "right", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", whiteSpace: "nowrap" };
                    return (
                      <tr key={r.strike} style={{ background: i === 0 ? "rgba(212,180,94,0.06)" : i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                        <td style={{ ...cell, textAlign: "left", color: i === 0 ? "var(--accent-gold)" : "var(--text-secondary)", fontWeight: i === 0 ? 700 : 400 }}>
                          {i === 0 ? "⭐ Best" : `#${i + 1}`}
                        </td>
                        <td style={{ ...cell, color: "var(--text-primary)", fontWeight: 600 }}>${r.strike}</td>
                        <td style={cell}>+{r.otmPct.toFixed(1)}%</td>
                        <td style={{ ...cell, color: "var(--text-primary)" }}>${fmt(r.premium)}</td>
                        <td style={cell}>{r.delta.toFixed(3)}</td>
                        <td style={cell}>{r.theta.toFixed(3)}</td>
                        <td style={{ ...cell, color: "var(--positive)" }}>{r.annYield.toFixed(1)}%</td>
                        <td style={cell}>{r.probProfit.toFixed(0)}%</td>
                        <td style={cell}>${fmt(r.breakeven)}</td>
                        <td style={{ ...cell, color: "var(--accent-gold)" }}>${Math.round(r.maxProfit).toLocaleString()}</td>
                        {basis > 0 && <td style={{ ...cell, color: r.roiOnBasis != null && r.roiOnBasis >= 0 ? "var(--positive)" : "var(--negative)" }}>{r.roiOnBasis != null ? `${r.roiOnBasis.toFixed(1)}%` : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
              No strikes match your delta range — widen Delta Min/Max above.
            </div>
          )}

          {/* Payoff diagram */}
          {best && payoffData.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
              <div style={labelStyle}>Payoff at Expiration — ${best.strike} Call</div>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={payoffData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                  <XAxis dataKey="px" tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => `$${v}`} minTickGap={50} />
                  <YAxis tick={{ fill: "#A9B8D0", fontSize: 12, fontFamily: "IBM Plex Mono" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => `$${v.toLocaleString()}`} width={80} />
                  <Tooltip
                    labelStyle={{ color: "#F1F5F9" }} itemStyle={{ color: "#F1F5F9" }}
                    contentStyle={{ background: "#283552", border: "1px solid #4C6190", borderRadius: 4, fontFamily: "IBM Plex Mono", fontSize: 12 }}
                    formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "P&L"]}
                    labelFormatter={(l: any) => `Stock at $${l}`}
                  />
                  <ReferenceLine y={0} stroke="var(--border-active)" />
                  <ReferenceLine x={best.breakeven} stroke="var(--accent-gold)" strokeDasharray="4 3"
                    label={{ value: `B/E $${fmt(best.breakeven)}`, fill: "#D4B45E", fontSize: 11, fontFamily: "IBM Plex Mono", position: "insideTopLeft" }} />
                  <ReferenceLine x={best.strike} stroke="#A9B8D0" strokeDasharray="2 4"
                    label={{ value: `Strike $${best.strike}`, fill: "#A9B8D0", fontSize: 11, fontFamily: "IBM Plex Mono", position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="pnl" stroke="#5B8DEF" strokeWidth={2} fill="#5B8DEF" fillOpacity={0.12} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "2rem" }}>
            Premiums are Black-Scholes estimates priced on 21-day historical volatility — live chains vary with market IV. Not financial advice.
          </div>
        </>
      )}

      {/* Education cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>What is a Covered Call?</div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            A covered call is an options strategy where you hold shares of a stock and sell (write) call options on the same stock. You collect the option premium upfront as income. The buyer of the call has the right — but not the obligation — to buy your shares at the strike price before expiration.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>When to Use</div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            Best used when you have a neutral to mildly bullish outlook on a stock you already own. Ideal in sideways or slowly rising markets. Higher implied volatility (IV) means larger premiums, making it more attractive to sell calls when IV is elevated.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>Risk / Reward</div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            Your upside is capped at the strike price — if the stock surges above it, you still deliver shares at the strike. The premium provides a buffer against downside, but you still bear the full risk of stock decline. The trade-off: income now vs. potential gains foregone.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CoveredCallsPage() {
  return <Suspense fallback={null}><CoveredCallsInner /></Suspense>;
}
