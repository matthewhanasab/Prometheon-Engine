"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";

const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const DEFAULT_TICKER = "AAPL";

type Contract = {
  symbol: string; strike: number; expiry: string; side: "call" | "put";
  bid: number | null; ask: number | null; mid: number | null; last: number | null;
  change: number | null; changePct: number | null;
  volume: number | null; openInterest: number | null; iv: number | null;
  delta: number | null; gamma: number | null; theta: number | null;
  vega: number | null; rho: number | null; theo: number | null;
  prevClose: number | null; lastTradeTime: string | null;
};
type Chain = {
  ticker: string; spot: number | null; asOf: string | null; delayed: boolean;
  expiry: string | null; expiries: string[]; totalContracts: number;
  calls: Contract[]; puts: Contract[];
};

const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const LABEL: React.CSSProperties = {
  fontSize: "0.58rem", textTransform: "uppercase", letterSpacing: "0.14em",
  color: "var(--text-secondary)",
};

const money = (n: number | null, d = 2) => (n == null ? "—" : `$${n.toFixed(d)}`);
const plain = (n: number | null, d = 4) => (n == null ? "—" : n.toFixed(d));
const pct = (n: number | null, d = 1) => (n == null ? "—" : `${(n * 100).toFixed(d)}%`);
const int = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 0 }));

function fmtExpiry(d: string) {
  const [y, m, day] = d.split("-");
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(m) - 1]} ${Number(day)} ’${y.slice(2)}`;
}
function daysTo(d: string) {
  return Math.max(0, Math.round((new Date(`${d}T16:00:00`).getTime() - Date.now()) / 86400000));
}

// ── Contract detail ───────────────────────────────────────────────────────────
// The feed is a snapshot with no per-contract history, so there is no price
// series to plot. What can be drawn honestly is the payoff at expiry, which is
// a property of the strike and what you'd pay today, not a forecast.
function PayoffChart({ c, spot }: { c: Contract; spot: number | null }) {
  const cost = c.mid ?? c.last ?? c.theo;
  if (cost == null) return null;
  const centre = spot ?? c.strike;
  const lo = Math.max(0, centre * 0.7);
  const hi = centre * 1.3;
  const pts = Array.from({ length: 61 }, (_, i) => {
    const px = lo + ((hi - lo) * i) / 60;
    const intrinsic = c.side === "call" ? Math.max(0, px - c.strike) : Math.max(0, c.strike - px);
    return { px, pl: (intrinsic - cost) * 100 };
  });
  const breakeven = c.side === "call" ? c.strike + cost : c.strike - cost;

  return (
    <div style={{ height: 200, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={pts} margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="px" type="number" domain={[lo, hi]}
            tickFormatter={(v: any) => `$${Math.round(v)}`}
            tick={{ fontFamily: MONO, fontSize: 9, fill: "var(--text-muted)" }} />
          <YAxis tickFormatter={(v: any) => (v === 0 ? "0" : `$${Math.round(v)}`)}
            tick={{ fontFamily: MONO, fontSize: 9, fill: "var(--text-muted)" }} width={52} />
          <Tooltip
            contentStyle={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 12, fontFamily: MONO, fontSize: "0.7rem" }}
            formatter={(v: any) => [`$${Number(v).toFixed(0)}`, "P/L per contract"]}
            labelFormatter={(v: any) => `Underlying $${Number(v).toFixed(2)}`} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />
          <ReferenceLine x={breakeven} stroke="var(--accent-gold)" strokeDasharray="4 3"
            label={{ value: "B/E", position: "top", fill: "var(--accent-gold)", fontSize: 9, fontFamily: MONO }} />
          {spot != null && (
            <ReferenceLine x={spot} stroke="var(--text-secondary)" strokeDasharray="2 3"
              label={{ value: "Spot", position: "top", fill: "var(--text-secondary)", fontSize: 9, fontFamily: MONO }} />
          )}
          <Line type="monotone" dataKey="pl" stroke="var(--accent-gold)" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Hoisted rather than declared inside Detail: a component defined during render
// is a new type each pass and remounts its subtree on every state change.
function Row({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
        {k}{hint && <span style={{ color: "var(--text-muted)", fontSize: "0.64rem" }}> · {hint}</span>}
      </span>
      <span style={{ fontFamily: MONO, fontSize: "0.8rem" }}>{v}</span>
    </div>
  );
}

function Detail({ c, spot, onClose }: { c: Contract; spot: number | null; onClose: () => void }) {
  const cost = c.mid ?? c.last ?? c.theo;
  const breakeven = cost == null ? null : c.side === "call" ? c.strike + cost : c.strike - cost;
  const itm = spot == null ? null : c.side === "call" ? spot > c.strike : spot < c.strike;
  const spread = c.bid != null && c.ask != null ? c.ask - c.bid : null;

  return (
    <div style={{ ...CARD, padding: "16px 18px", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 500 }}>
            {c.side === "call" ? "Call" : "Put"} · ${c.strike} · {fmtExpiry(c.expiry)}
          </div>
          <div style={{ fontFamily: MONO, fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 3 }}>
            {c.symbol} · {daysTo(c.expiry)}d to expiry
            {itm != null && (
              <span style={{ color: itm ? "var(--positive)" : "var(--text-muted)" }}> · {itm ? "in the money" : "out of the money"}</span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: "var(--accent-gold)", border: "none", color: "var(--on-accent)",
          borderRadius: 999, padding: "8px 18px", fontSize: "0.72rem", fontWeight: 700,
          cursor: "pointer", fontFamily: SANS, whiteSpace: "nowrap",
        }}>← Back to chain</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
        <div>
          <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: 5, marginBottom: 4 }}>Quote</div>
          <Row k="Bid / Ask" v={`${money(c.bid)} / ${money(c.ask)}`} />
          <Row k="Mid" v={money(c.mid)} />
          <Row k="Spread" v={spread == null ? "—" : money(spread)} />
          <Row k="Last traded" v={money(c.last)} />
          <Row k="Change" v={c.change == null ? "—" : `${c.change >= 0 ? "+" : ""}${c.change.toFixed(2)} (${c.changePct?.toFixed(1) ?? "—"}%)`} />
          <Row k="Theoretical" v={money(c.theo)} hint="exchange model" />
          <Row k="Breakeven" v={breakeven == null ? "—" : money(breakeven)} hint="at expiry" />
        </div>

        <div>
          <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: 5, marginBottom: 4 }}>Greeks</div>
          <Row k="Delta" v={plain(c.delta)} hint="per $1 move" />
          <Row k="Gamma" v={plain(c.gamma)} hint="delta drift" />
          <Row k="Theta" v={plain(c.theta)} hint="daily decay" />
          <Row k="Vega" v={plain(c.vega)} hint="per 1 vol pt" />
          <Row k="Rho" v={plain(c.rho)} hint="per 1% rates" />
          <Row k="Implied vol" v={pct(c.iv)} />
        </div>

        <div>
          <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: 5, marginBottom: 4 }}>Activity</div>
          <Row k="Volume" v={int(c.volume)} hint="today" />
          <Row k="Open interest" v={int(c.openInterest)} />
          <Row k="Prev close" v={money(c.prevClose)} />
          <Row k="Last trade" v={c.lastTradeTime ? c.lastTradeTime.replace("T", " ").slice(0, 16) : "—"} />
        </div>
      </div>

      <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: 5, marginTop: 16 }}>
        Profit / loss at expiry — one contract (100 shares)
      </div>
      <PayoffChart c={c} spot={spot} />
      <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
        Payoff is computed from the strike and the current mid — it&rsquo;s what this contract is worth at
        expiry for a given underlying price, not a prediction. The feed publishes a snapshot with no
        per-contract history, so there is no price series to chart.
      </div>
    </div>
  );
}

// ── Chain table ───────────────────────────────────────────────────────────────
function ChainTable({
  calls, puts, spot, onPick, selected,
}: {
  calls: Contract[]; puts: Contract[]; spot: number | null;
  onPick: (c: Contract) => void; selected: string | null;
}) {
  const strikes = [...new Set([...calls, ...puts].map((c) => c.strike))].sort((a, b) => a - b);
  const callBy = new Map(calls.map((c) => [c.strike, c]));
  const putBy = new Map(puts.map((c) => [c.strike, c]));

  // Chains list every strike ever opened, so the deep in-the-money tail sits at
  // the top and the tradeable strikes are far below the fold. The strike nearest
  // spot is found once and scrolled to, so the view opens at the money.
  const atmStrike = spot == null || !strikes.length
    ? null
    : strikes.reduce((best, s) => (Math.abs(s - spot) < Math.abs(best - spot) ? s : best), strikes[0]);
  const scrollBox = React.useRef<HTMLDivElement>(null);
  const atmRow = React.useRef<HTMLTableRowElement>(null);
  React.useEffect(() => {
    const box = scrollBox.current, row = atmRow.current;
    if (!box || !row) return;
    // Measured against the box rather than via offsetTop, which resolves to
    // whichever ancestor happens to be positioned — the table here, not the
    // scroller. Deferred a frame so the rows have been laid out.
    const id = requestAnimationFrame(() => {
      const b = box.getBoundingClientRect(), r = row.getBoundingClientRect();
      box.scrollTop += r.top - b.top - box.clientHeight / 2 + r.height / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [calls, puts]);

  // Both header rows stick. Only the lower one did before, so scrolling into the
  // chain took the Calls/Puts labels away and left two mirrored blocks of
  // numbers with nothing saying which was which.
  const BAND_H = 26;
  const thBand: React.CSSProperties = {
    ...LABEL, padding: "6px 8px", height: BAND_H, whiteSpace: "nowrap",
    position: "sticky", top: 0, zIndex: 2, background: "var(--bg-primary)",
    fontSize: "0.62rem", fontWeight: 700,
  };
  const th: React.CSSProperties = {
    ...LABEL, padding: "7px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap",
    position: "sticky", top: BAND_H, zIndex: 2, background: "var(--bg-primary)", textAlign: "right",
  };
  // A single rule down the strike column separates the two books at any scroll
  // position, so the side is legible without reading the header.
  const callEdge: React.CSSProperties = { borderRight: "1px solid var(--border)" };
  const putEdge: React.CSSProperties = { borderLeft: "1px solid var(--border)" };
  const td: React.CSSProperties = {
    padding: "5px 8px", fontFamily: MONO, fontSize: "0.74rem", textAlign: "right", whiteSpace: "nowrap",
  };

  const cell = (c: Contract | undefined, key: keyof Contract, fmt: (v: number | null) => string) => (
    <td style={{
      ...td,
      cursor: c ? "pointer" : "default",
      color: c && selected === c.symbol ? "var(--accent-gold)" : undefined,
    }} onClick={() => c && onPick(c)}>
      {c ? fmt(c[key] as number | null) : "—"}
    </td>
  );

  return (
    <div style={{ ...CARD, overflow: "hidden" }}>
      <div ref={scrollBox} style={{ overflow: "auto", maxHeight: "62vh", position: "relative" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th colSpan={5} style={{ ...thBand, ...callEdge, textAlign: "center", color: "var(--positive)" }}>
                ▲ Calls — right to buy
              </th>
              <th style={{ ...thBand, textAlign: "center", color: "var(--text-secondary)" }}>Strike</th>
              <th colSpan={5} style={{ ...thBand, ...putEdge, textAlign: "center", color: "var(--negative)" }}>
                ▼ Puts — right to sell
              </th>
            </tr>
            <tr>
              <th style={th}>OI</th><th style={th}>Vol</th><th style={th}>IV</th><th style={th}>Delta</th>
              <th style={{ ...th, ...callEdge }}>Bid/Ask</th>
              <th style={{ ...th, textAlign: "center" }} />
              <th style={{ ...th, ...putEdge, textAlign: "left" }}>Bid/Ask</th>
              <th style={th}>Delta</th><th style={th}>IV</th><th style={th}>Vol</th><th style={th}>OI</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((k, i) => {
              const c = callBy.get(k);
              const p = putBy.get(k);
              const atm = atmStrike === k;
              return (
                <tr key={k} ref={atm ? atmRow : undefined} style={{
                  background: atm ? "var(--bg-elevated)" : i % 2 ? "var(--bg-surface)" : "transparent",
                  borderTop: atm ? "1px solid var(--border-active)" : undefined,
                  borderBottom: atm ? "1px solid var(--border-active)" : undefined,
                }}>
                  {cell(c, "openInterest", int)}
                  {cell(c, "volume", int)}
                  {cell(c, "iv", (v) => pct(v))}
                  {cell(c, "delta", (v) => plain(v, 3))}
                  <td style={{ ...td, ...callEdge, cursor: c ? "pointer" : "default", color: c && selected === c.symbol ? "var(--accent-gold)" : undefined }}
                    onClick={() => c && onPick(c)}>
                    {c ? `${money(c.bid)}/${money(c.ask)}` : "—"}
                  </td>
                  <td style={{ ...td, textAlign: "center", fontWeight: 600, color: atm ? "var(--accent-gold)" : "var(--text-primary)" }}>
                    {k}
                  </td>
                  <td style={{ ...td, ...putEdge, textAlign: "left", cursor: p ? "pointer" : "default", color: p && selected === p.symbol ? "var(--accent-gold)" : undefined }}
                    onClick={() => p && onPick(p)}>
                    {p ? `${money(p.bid)}/${money(p.ask)}` : "—"}
                  </td>
                  {cell(p, "delta", (v) => plain(v, 3))}
                  {cell(p, "iv", (v) => pct(v))}
                  {cell(p, "volume", int)}
                  {cell(p, "openInterest", int)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptionsChainInner() {
  const search = useSearchParams();
  const initial = (search.get("ticker") ?? DEFAULT_TICKER).toUpperCase();
  const [input, setInput] = useState(initial);
  const [chain, setChain] = useState<Chain | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Contract | null>(null);
  // The chain is scrolled when a row is clicked, so the detail would otherwise
  // open below the fold on the view it replaces.
  const pick = useCallback((c: Contract) => {
    setPicked(c);
    document.querySelector(".main-content")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, []);
  const booted = React.useRef(false);

  const load = useCallback(async (ticker: string, expiry?: string) => {
    setLoading(true); setError(null);
    try {
      const qs = expiry ? `?expiry=${encodeURIComponent(expiry)}` : "";
      const res = await fetch(`/api/options-chain/${ticker.toUpperCase()}${qs}`);
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error ?? "Request failed");
      setChain(j);
      setPicked(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load"); setChain(null);
    } finally { setLoading(false); }
  }, []);

  // The guard is set when the timer FIRES, not when the effect runs. Setting it
  // up front meant StrictMode's mount/cleanup/mount cancelled the scheduled load
  // on the first pass and skipped it on the second, so the chain never loaded in
  // development while production (single mount) looked fine.
  useEffect(() => {
    if (booted.current) return;
    const id = setTimeout(() => { booted.current = true; load(initial); }, 0);
    return () => clearTimeout(id);
  }, [initial, load]);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "3rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", marginBottom: "0.35rem" }}>
        Options Chain
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.45, maxWidth: 200, marginBottom: "0.9rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.4rem" }}>
        Live quotes, implied volatility and greeks for every listed contract — click any row for detail
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(input); }}
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: "1.3rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
          style={{
            width: 130, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999,
            padding: "8px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.8rem", outline: "none",
          }} />
        <button type="submit" style={{
          background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 999,
          padding: "9px 22px", fontFamily: SANS, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
        }}>Load chain</button>
        {loading && <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Loading…</span>}
        {chain?.spot != null && !loading && (
          <span style={{ fontFamily: MONO, fontSize: "0.85rem" }}>
            {chain.ticker} <span style={{ color: "var(--accent-gold)" }}>{money(chain.spot)}</span>
            <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}> · {int(chain.totalContracts)} contracts</span>
          </span>
        )}
      </form>

      {error && (
        <div style={{ ...CARD, padding: "1rem 1.2rem", fontSize: "0.8rem", color: "var(--negative)" }}>{error}</div>
      )}

      {chain && (
        <>
          {picked ? (
            <Detail c={picked} spot={chain.spot} onClose={() => setPicked(null)} />
          ) : (
            <>
          <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: "0.45rem", marginBottom: "0.7rem" }}>
            Expiry
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: "1.4rem" }}>
            {chain.expiries.map((e) => (
              <button key={e} onClick={() => load(chain.ticker, e)} style={{
                background: e === chain.expiry ? "var(--accent-gold)" : "var(--bg-elevated)",
                color: e === chain.expiry ? "var(--on-accent)" : "var(--text-secondary)",
                border: "1px solid var(--border)", borderRadius: 999, padding: "0.3rem 0.75rem",
                fontFamily: MONO, fontSize: "0.72rem", cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {fmtExpiry(e)} <span style={{ opacity: 0.65 }}>{daysTo(e)}d</span>
              </button>
            ))}
          </div>

          <ChainTable calls={chain.calls} puts={chain.puts} spot={chain.spot}
            onPick={pick} selected={null} />
            </>
          )}

          <div style={{ marginTop: "1.2rem", fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
            Quotes and greeks are published by Cboe and are delayed at least 15 minutes
            {chain.asOf && <> — newest print in this file is {chain.asOf.replace("T", " ").slice(0, 16)}</>}.
            Delta, gamma, theta, vega, rho and implied volatility come from the exchange rather than being
            modelled here, unlike the Black-Scholes figures on{" "}
            <Link href="/covered-calls" style={{ color: "var(--accent-gold)", textDecoration: "none" }}>Covered Calls</Link>.
          </div>
        </>
      )}
    </div>
  );
}

export default function OptionsChainPage() {
  return (
    <Suspense fallback={<div style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-secondary)" }}>Loading…</div>}>
      <OptionsChainInner />
    </Suspense>
  );
}
