"use client";

import { useState, Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import Icon from "@/components/Icon";
import { ErrorNote, SkeletonCards } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

import {
  callPrice, callDelta, callTheta, gamma as bsGamma, vega as bsVega, callRho,
  probITMCall, expectedMove,
} from "@/lib/blackscholes";

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
  gamma: number;
  vega: number;
  rho: number;
  probITM: number;
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
  borderRadius: 22,
  color: "var(--text-primary)",
  fontSize: "0.85rem",
  fontFamily: "'Spline Sans Mono', monospace",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  marginBottom: "0.35rem",
  display: "block",
  fontFamily: "'Public Sans', sans-serif",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 22,
  padding: "1.1rem 1.25rem",
};

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "gold" }) {
  const subColor = tone === "good" ? "var(--positive)" : tone === "bad" ? "var(--negative)" : tone === "gold" ? "var(--accent-gold)" : "var(--text-secondary)";
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "12px 14px" }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
      {sub && <div style={{ fontSize: "0.7rem", color: subColor, marginTop: 4, fontFamily: "'Public Sans', sans-serif" }}>{sub}</div>}
    </div>
  );
}

// Arrow-key navigation: right-arrow at the end of a field jumps to the next one,
// left-arrow at the start jumps back.
function navKeys(e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
  const el = e.currentTarget;
  const fields = Array.from(document.querySelectorAll<HTMLElement>("[data-nav]"))
    .sort((a, b) => Number(a.dataset.nav) - Number(b.dataset.nav));
  const idx = fields.indexOf(el as HTMLElement);
  if (idx < 0) return;

  const isInput = el instanceof HTMLInputElement;
  const caret = isInput ? (el as HTMLInputElement).selectionStart : null;
  const len = isInput ? (el as HTMLInputElement).value.length : 0;

  if (e.key === "ArrowRight" && (!isInput || caret === len)) {
    const next = fields[idx + 1];
    if (next) { e.preventDefault(); next.focus(); if (next instanceof HTMLInputElement) next.select(); }
  } else if (e.key === "ArrowLeft" && (!isInput || caret === 0)) {
    const prev = fields[idx - 1];
    if (prev) { e.preventDefault(); prev.focus(); if (prev instanceof HTMLInputElement) prev.select(); }
  }
}

// ─── page ─────────────────────────────────────────────────────────────────────

// Inputs come from marketstack + FRED + SEC EDGAR; every strike, premium and
// greek on this page is computed locally from Black-Scholes — there is no
// options-chain feed involved.
export function CoveredCallsInner({ apiBase = "/api/ms-options" }: { apiBase?: string } = {}) {
  // Opens on a worked example; the position fields below re-rank it live.
  const [ticker, setTicker] = useUrlTicker("AAPL");
  const { data, loading, stale, error, retry } = useTickerData<CCData>(ticker, (t) => `${apiBase}/${t}`);
  const [draft, setDraft] = useState<string | null>(null);

  // Position + strategy inputs
  const [shares, setShares] = useState("100");
  const [costBasis, setCostBasis] = useState("");
  const [dte, setDte] = useState(30);
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [deltaMin, setDeltaMin] = useState("0.15");
  const [deltaMax, setDeltaMax] = useState("0.40");

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
      const premium = callPrice(S, K, T, rfr, iv);
      const delta = callDelta(S, K, T, rfr, iv);
      if (delta < dMin || delta > dMax || premium < 0.01) return null;
      const theta = callTheta(S, K, T, rfr, iv);
      const gamma = bsGamma(S, K, T, rfr, iv);
      const vega = bsVega(S, K, T, rfr, iv);
      const rho = callRho(S, K, T, rfr, iv);
      const probITM = probITMCall(S, K, T, rfr, iv);
      const annYield = (premium / S) * (365 / dte) * 100;
      const probProfit = (1 - probITM) * 100;
      const maxProfit = premium * 100 * contracts;
      const breakeven = S - premium;
      const netIfAssigned = basis > 0 ? K - basis + premium : null;
      const roiOnBasis = basis > 0 && netIfAssigned != null ? (netIfAssigned / basis) * 100 : null;

      let score: number;
      if (strategy === "maxYield") score = annYield;
      else if (strategy === "safest") score = probProfit + annYield * 0.01; // rank by prob of profit, yield as tiebreak
      else score = 100 - Math.abs(delta - 0.27) * 300 + annYield * 0.05; // sweet spot: ~0.27 delta, yield as tiebreak

      return {
        strike: K, otmPct: ((K - S) / S) * 100, premium, delta, theta, gamma, vega, rho, probITM,
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
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)" }}>
      <PageHeader title="Covered Call Calculator"
        subtitle="Enter a position you hold. Every strike is priced, scored and ranked for the strategy you pick." />

      {/* Position form */}
      <div style={{ ...cardStyle, marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "14px 18px", marginBottom: 14 }}>
          <div>
            <label htmlFor="cc-ticker" style={labelStyle}>Ticker</label>
            <TickerInput id="cc-ticker" value={ticker} onSubmit={setTicker} onDraftChange={setDraft} action="" width="100%" placeholder="Ticker" />
          </div>
          <div>
            <label htmlFor="cc-shares" style={labelStyle}>Shares Owned</label>
            <input id="cc-shares" data-nav={1} inputMode="numeric" value={shares} onChange={e => setShares(e.target.value)} onKeyDown={navKeys} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cc-basis" style={labelStyle}>Cost Basis / Share ($)</label>
            <input id="cc-basis" data-nav={2} inputMode="decimal" placeholder="optional" value={costBasis} onChange={e => setCostBasis(e.target.value)} onKeyDown={navKeys} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cc-dte" style={labelStyle}>Target Expiration</label>
            <select id="cc-dte" data-nav={3} value={dte} onChange={e => setDte(Number(e.target.value))} style={{ ...inputStyle, cursor: "pointer" }}>
              {DTE_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cc-dmin" style={labelStyle}>Delta Min</label>
            <input id="cc-dmin" data-nav={4} inputMode="decimal" value={deltaMin} onChange={e => setDeltaMin(e.target.value)} onKeyDown={navKeys} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cc-dmax" style={labelStyle}>Delta Max</label>
            <input id="cc-dmax" data-nav={5} inputMode="decimal" value={deltaMax} onChange={e => setDeltaMax(e.target.value)} onKeyDown={navKeys} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div role="group" aria-labelledby="cc-strategy">
            <div id="cc-strategy" style={labelStyle}>Strategy</div>
            <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden" }}>
              {([["balanced", "Balanced"], ["maxYield", "Max Yield"], ["safest", "Safest"]] as [Strategy, string][]).map(([key, label]) => (
                <button key={key} type="button" aria-pressed={strategy === key} onClick={() => setStrategy(key)} style={{
                  padding: "0.5rem 1rem", fontSize: "0.72rem", fontWeight: 600, border: "none", cursor: "pointer",
                  fontFamily: "'Public Sans', sans-serif",
                  background: strategy === key ? "var(--accent-gold)" : "transparent",
                  color: strategy === key ? "var(--on-accent)" : "var(--text-secondary)",
                }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => { if (draft?.trim()) setTicker(draft); }} disabled={loading} aria-busy={loading} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 24px", background: "var(--accent-gold)", border: "none", borderRadius: 22,
            color: "var(--on-accent)", fontFamily: "'Public Sans', sans-serif", fontSize: "0.8rem", fontWeight: 700,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.75 : 1,
          }}>
            {loading && <span className="spinner" style={{ width: 13, height: 13, borderColor: "color-mix(in srgb, var(--on-accent) 30%, transparent)", borderTopColor: "var(--on-accent)" }} />}
            Screen options
          </button>
          <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
            Strategy, deltas, shares and basis re-rank instantly.
          </span>
        </div>
      </div>

      {error && <ErrorNote title={`${ticker} didn't load`} message={lookupErrorText(error)} onRetry={retry} style={{ marginBottom: "1.5rem" }} />}
      {loading && !data && <div style={{ marginBottom: "1.5rem" }}><SkeletonCards count={6} minWidth={150} /></div>}

      {data && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          {/* Earnings warning */}
          {earningsBeforeExpiry && (
            <div role="note" style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(var(--accent-rgb), 0.10)", border: "1px solid rgba(var(--accent-rgb), 0.3)", borderRadius: 22, padding: "11px 16px", marginBottom: "1.25rem", fontSize: "0.8rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
              <Icon name="alert" size={16} style={{ color: "var(--accent-gold)", marginTop: 1 }} />
              <span><strong>Earnings on {data.nextEarnings}</strong> fall before your {expiryDate.toISOString().slice(0, 10)} expiry. Selling calls through earnings carries gap risk.</span>
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

          {/* Expected move stats */}
          {S > 0 && iv > 0 && (() => {
            const em = expectedMove(S, iv, T);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: "1.5rem" }}>
                <Metric label="Expected Move by Expiry" value={`±$${fmt(em)}`} sub={`±${((em / S) * 100).toFixed(1)}% (1 std dev)`} tone="gold" />
                <Metric label="ATM IV (est.)" value={`${(iv * 100).toFixed(1)}%`} sub="21-day historical vol" />
                <Metric label="1SD Range" value={`$${fmt(S - em)} – $${fmt(S + em)}`} sub={`by ${expiryDate.toISOString().slice(0, 10)}`} />
              </div>
            );
          })()}

          {/* Best pick */}
          {best && (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--accent-gold)", borderRadius: 22, padding: "16px 20px", marginBottom: "1.5rem" }}>
              <div style={{ ...labelStyle, color: "var(--accent-gold)", display: "flex", alignItems: "center", gap: 6 }}><Icon name="star" size={13} filled /> Best pick — {strategy === "maxYield" ? "Max Yield" : strategy === "safest" ? "Safest" : "Balanced"}</div>
              <div style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.3rem", fontWeight: 700, marginBottom: 6 }}>
                Sell the ${best.strike} call · collect ~${Math.round(best.maxProfit).toLocaleString()} upfront
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {best.probProfit.toFixed(0)}% chance of keeping the full premium · breakeven falls to ${fmt(best.breakeven)} ·
                upside capped at ${Math.round((best.strike - S) * numShares + best.maxProfit).toLocaleString()} if called away
                {best.roiOnBasis != null ? ` · ${best.roiOnBasis.toFixed(1)}% return on your cost basis if assigned` : ""}
                {earningsBeforeExpiry ? " · earnings fall before expiry" : ""}
                {` · delta ${best.delta.toFixed(2)} · theta -$${Math.abs(best.theta).toFixed(2)}/day per share`}
              </div>
            </div>
          )}

          {/* Contracts table */}
          {rows.length > 0 ? (
            <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22, marginBottom: "1.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ background: "var(--bg-primary)" }}>
                    {["Rank", "Strike", "OTM %", "Est. Premium", "Delta", "Theta $/day", "Gamma", "Vega", "Ann. Yield", "Prob. Profit", "Breakeven", "Max Premium", basis > 0 ? "ROI on Basis" : null].filter(Boolean).map((h, i) => (
                      <th key={h as string} style={{
                        textAlign: i === 0 ? "left" : "right", padding: "9px 12px",
                        fontFamily: "'Public Sans', sans-serif", fontSize: "0.6875rem", fontWeight: 500,
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
                      <tr key={r.strike} style={{ background: i === 0 ? "rgba(61,230,140,0.06)" : i % 2 === 0 ? "var(--bg-surface)" : "var(--bg-primary)" }}>
                        <td style={{ ...cell, textAlign: "left", color: i === 0 ? "var(--accent-gold)" : "var(--text-secondary)", fontWeight: i === 0 ? 700 : 400 }}>
                          {i === 0 ? "⭐ Best" : `#${i + 1}`}
                        </td>
                        <td style={{ ...cell, color: "var(--text-primary)", fontWeight: 600 }}>${r.strike}</td>
                        <td style={cell}>+{r.otmPct.toFixed(1)}%</td>
                        <td style={{ ...cell, color: "var(--text-primary)" }}>${fmt(r.premium)}</td>
                        <td style={cell}>{r.delta.toFixed(3)}</td>
                        <td style={cell}>{r.theta.toFixed(3)}</td>
                        <td style={cell}>{r.gamma.toFixed(4)}</td>
                        <td style={cell}>{r.vega.toFixed(2)}</td>
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
                  <XAxis dataKey="px" tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => `$${v}`} minTickGap={50} />
                  <YAxis tick={{ fill: "var(--tick)", fontSize: 12, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false}
                    tickFormatter={(v: any) => `$${v.toLocaleString()}`} width={80} />
                  <Tooltip
                    labelStyle={{ color: "var(--text-primary)" }} itemStyle={{ color: "var(--text-primary)" }}
                    contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 22, fontFamily: "Spline Sans Mono", fontSize: 12 }}
                    formatter={(v: any) => [`$${Number(v).toLocaleString()}`, "P&L"]}
                    labelFormatter={(l: any) => `Stock at $${l}`}
                  />
                  <ReferenceLine y={0} stroke="var(--border-active)" />
                  <ReferenceLine x={best.breakeven} stroke="var(--accent-gold)" strokeDasharray="4 3"
                    label={{ value: `B/E $${fmt(best.breakeven)}`, fill: "var(--accent-gold)", fontSize: 11, fontFamily: "Spline Sans Mono", position: "insideTopLeft" }} />
                  <ReferenceLine x={best.strike} stroke="var(--tick)" strokeDasharray="2 4"
                    label={{ value: `Strike $${best.strike}`, fill: "var(--tick)", fontSize: 11, fontFamily: "Spline Sans Mono", position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="pnl" stroke="var(--accent-2)" strokeWidth={2} fill="var(--accent-2)" fillOpacity={0.12} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "2rem" }}>
            Premiums are Black-Scholes estimates priced on 21-day historical volatility — live chains vary with market IV. Not financial advice.
          </div>
        </div>
      )}

      {/* Education cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>What is a Covered Call?</div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            A covered call is an options strategy where you hold shares of a stock and sell (write) call options on the same stock. You collect the option premium upfront as income. The buyer of the call has the right — but not the obligation — to buy your shares at the strike price before expiration.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>When to Use</div>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
            Best used when you have a neutral to mildly bullish outlook on a stock you already own. Ideal in sideways or slowly rising markets. Higher implied volatility (IV) means larger premiums, making it more attractive to sell calls when IV is elevated.
          </p>
        </div>
        <div style={cardStyle}>
          <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--accent-gold)", marginBottom: 8 }}>Risk / Reward</div>
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
