"use client";

import React, { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import Icon from "@/components/Icon";
import { ErrorNote, SkeletonTable } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot,
} from "recharts";
import { ChartTip, seriesTip, lineCursor, grid, xAxis, yAxis, activeDot, LegendRow, useTimeframe } from "@/components/charts/kit";
import { valueHistory, type Close, type Valued } from "@/lib/optionValue";

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
  fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.14em",
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

// The underlying's daily closes, fetched once per ticker and shared by every
// contract opened on it.
const closesCache = new Map<string, Promise<Close[]>>();
function loadCloses(ticker: string): Promise<Close[]> {
  let hit = closesCache.get(ticker);
  if (!hit) {
    hit = fetch(`/api/option-history/${ticker}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => (Array.isArray(j?.closes) ? (j.closes as Close[]) : Promise.reject(new Error("empty"))));
    // A failure is not remembered, so opening another contract tries again.
    hit.catch(() => closesCache.delete(ticker));
    closesCache.set(ticker, hit);
  }
  return hit;
}

/** The standard monthly expiry: the third Friday of its month. */
function isThirdFriday(d: string): boolean {
  const date = new Date(`${d}T00:00:00Z`);
  const day = date.getUTCDate();
  return date.getUTCDay() === 5 && day >= 15 && day <= 21;
}
const longDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const tickDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The contract's value over time.
 *
 * No feed the site can read carries the price history of an individual
 * contract, so the line is an estimate (see lib/optionValue.ts): the contract
 * valued on each past day at the stock's close, holding volatility at the
 * level that reproduces today's quote. It is drawn dashed, the way a
 * projection is, and the two prices that are real, today's quote and the
 * previous close, are drawn as solid dots on top of it so the gap between
 * model and market is visible instead of hidden.
 */
function ValueChart({ c, spot, ticker, asOf }: { c: Contract; spot: number | null; ticker: string; asOf: string | null }) {
  const [loaded, setLoaded] = useState<{ ticker: string; closes: Close[] | null } | null>(null);
  useEffect(() => {
    let live = true;
    loadCloses(ticker).then(
      (closes) => { if (live) setLoaded({ ticker, closes }); },
      () => { if (live) setLoaded({ ticker, closes: null }); },
    );
    return () => { live = false; };
  }, [ticker]);
  const state = loaded && loaded.ticker === ticker ? loaded : null;

  const price = c.mid ?? c.last ?? c.theo;
  const today = (asOf ?? new Date().toISOString()).slice(0, 10);
  // A contract can't be valued for days before it existed, and the feed doesn't
  // say when it was listed. The listing calendar does, roughly: the monthly
  // series (third Friday) are opened many months ahead, while weekly and daily
  // expiries appear only about six weeks before they expire. So a weekly is
  // drawn over six weeks at most.
  const monthly = isThirdFriday(c.expiry);
  const est = useMemo(() => {
    if (!state?.closes || price == null || spot == null) return null;
    const from = monthly ? "" : new Date(Date.parse(`${today}T00:00:00Z`) - 45 * 864e5).toISOString().slice(0, 10);
    return valueHistory({
      side: c.side, strike: c.strike, expiry: c.expiry, price, spot, today,
      closes: state.closes.filter((x) => x.date >= from), fallbackVol: c.iv,
    });
  }, [state, price, spot, today, monthly, c.side, c.strike, c.expiry, c.iv]);

  const frame = useTimeframe<Valued>(est?.series ?? [], (r) => r.date, {
    label: "Time frame for the value chart", frames: ["1W", "1M", "3M", "6M", "1Y"], initial: "3M",
  });
  const rows = frame.rows;
  const last = rows[rows.length - 1];
  const prior = rows.length > 1 ? rows[rows.length - 2] : null;
  const first = rows[0];
  const move = first && last && first.value > 0 ? (last.value - first.value) / first.value : null;

  const head = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px 12px", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginTop: 18 }}>
      <span style={LABEL}>Estimated value over time, per share</span>
      {frame.control}
    </div>
  );

  if (!state) {
    return (
      <>
        {head}
        <div role="status" aria-label="Loading the value chart" className="skeleton-bar" style={{ height: 220, borderRadius: 14, marginTop: 12 }} />
      </>
    );
  }
  if (!est || rows.length < 3) {
    return (
      <>
        {head}
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6, margin: "12px 0 0", maxWidth: "70ch" }}>
          {!state.closes
            ? "The stock's price history didn't load, so the contract's value can't be estimated right now. Close this contract and open it again to retry."
            : "There is no quote for this contract to value it from: it has no bid, ask or recent trade."}
        </p>
      </>
    );
  }

  return (
    <>
      {head}
      <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 14px", margin: "12px 0 2px" }}>
        <LegendRow items={[
          { name: "Estimated value", color: "var(--series-1)", shape: "dash" },
          { name: "Actual quote", color: "var(--text-primary)", shape: "box" },
        ]} />
        {move != null && first && (
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
            From about <span style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>{money(first.value)}</span> on {tickDate(first.date)} to{" "}
            <span style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>{money(last.value)}</span> now
          </span>
        )}
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 22, bottom: 0, left: 0 }}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="date" {...xAxis} tickFormatter={tickDate} minTickGap={40} />
            <YAxis {...yAxis} width={52} tickFormatter={(v: number) => `$${v >= 100 || (v >= 10 && Number.isInteger(v)) ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)}`} domain={["auto", "auto"]} />
            <Tooltip isAnimationActive={false} cursor={lineCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
              content={<ChartTip build={(r: Valued) => ({
                title: longDate(r.date),
                rows: [{ value: money(r.value) }],
                sub: r.date === today ? "actual quote" : "estimate",
                notes: [{ name: "Stock closed at", value: money(r.stock), tone: "flat" as const }],
              })} />} />
            <Line type="linear" dataKey="value" stroke="var(--series-1)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round"
              dot={false} isAnimationActive={false} activeDot={{ ...activeDot, fill: "var(--series-1)" }} />
            {prior && c.prevClose != null && c.prevClose > 0 && (
              <ReferenceDot x={prior.date} y={c.prevClose} r={4} fill="var(--text-primary)" stroke="var(--surface-solid)" strokeWidth={2} ifOverflow="extendDomain" />
            )}
            {last && <ReferenceDot x={last.date} y={last.value} r={4.5} fill="var(--text-primary)" stroke="var(--surface-solid)" strokeWidth={2} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6, maxWidth: "82ch" }}>
        The dashed line is an estimate, not a record of trades: no public feed carries the price history of a single
        contract. It values this contract on each day from the stock&rsquo;s closing price and the time then left to
        expiry, holding implied volatility at {(est.vol * 100).toFixed(1)}%{est.calibrated ? ", the level that reproduces today's quote" : ", the level the exchange reports"}.
        Real prices would also have moved with volatility itself, most of all around earnings.{" "}
        {monthly
          ? "The contract may not have been listed for the whole period."
          : "Weekly contracts are listed about six weeks before they expire, so the chart goes back no further."} The solid dots are actual quotes: today&rsquo;s{prior && c.prevClose != null && c.prevClose > 0 ? " and the previous close" : ""}.
      </p>
    </>
  );
}

// The payoff at expiry is a property of the strike and what you'd pay today,
// not a forecast.
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
          <CartesianGrid {...grid} />
          <XAxis dataKey="px" type="number" domain={[lo, hi]}
            tickFormatter={(v: any) => `$${Math.round(v)}`}
            tick={{ fontFamily: MONO, fontSize: 11, fill: "var(--text-muted)" }} />
          <YAxis tickFormatter={(v: any) => (v === 0 ? "0" : `$${Math.round(v)}`)}
            tick={{ fontFamily: MONO, fontSize: 11, fill: "var(--text-muted)" }} width={52} />
          <Tooltip isAnimationActive={false} cursor={lineCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
                    content={<ChartTip build={seriesTip({ title: (l) => `Stock at $${Number(l).toFixed(2)}`, sub: "per contract", single: true, value: (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(0)}` })} />} />
          <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />
          <ReferenceLine x={breakeven} stroke="var(--accent-gold)" strokeDasharray="4 3"
            label={{ value: "B/E", position: "top", fill: "var(--accent-gold)", fontSize: 11, fontFamily: MONO }} />
          {spot != null && (
            <ReferenceLine x={spot} stroke="var(--text-secondary)" strokeDasharray="2 3"
              label={{ value: "Spot", position: "top", fill: "var(--text-secondary)", fontSize: 11, fontFamily: MONO }} />
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
        {k}{hint && <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}> · {hint}</span>}
      </span>
      <span style={{ fontFamily: MONO, fontSize: "0.8rem" }}>{v}</span>
    </div>
  );
}

function Detail({ c, spot, ticker, asOf, onClose }: { c: Contract; spot: number | null; ticker: string; asOf: string | null; onClose: () => void }) {
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
          <div style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 3 }}>
            {c.symbol} · {daysTo(c.expiry)}d to expiry
            {itm != null && (
              <span style={{ color: itm ? "var(--positive)" : "var(--text-muted)" }}> · {itm ? "in the money" : "out of the money"}</span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "var(--accent-gold)", border: "none", color: "var(--on-accent)",
          borderRadius: 999, padding: "9px 18px", fontSize: "0.78rem", fontWeight: 700,
          cursor: "pointer", fontFamily: SANS, whiteSpace: "nowrap",
        }}><Icon name="arrow-left" size={14} strokeWidth={2.2} /> Back to chain</button>
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

      <ValueChart key={c.symbol} c={c} spot={spot} ticker={ticker} asOf={asOf} />

      <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: 5, marginTop: 20 }}>
        Profit or loss at expiry, one contract (100 shares)
      </div>
      <PayoffChart c={c} spot={spot} />
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
        Payoff is computed from the strike and the current mid. It is what this contract is worth at
        expiry for a given stock price, not a prediction.
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
    fontSize: "0.6875rem", fontWeight: 700,
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
                Calls: the right to buy
              </th>
              <th style={{ ...thBand, textAlign: "center", color: "var(--text-secondary)" }}>Strike</th>
              <th colSpan={5} style={{ ...thBand, ...putEdge, textAlign: "center", color: "var(--negative)" }}>
                Puts: the right to sell
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
  const [ticker, setTicker] = useUrlTicker(DEFAULT_TICKER);
  // The chosen expiry belongs to one ticker; a new ticker starts at its nearest expiry.
  const [chosen, setChosen] = useState<{ ticker: string; expiry: string } | null>(null);
  const expiry = chosen && chosen.ticker === ticker ? chosen.expiry : null;
  const { data: chain, loading, stale, error, retry } = useTickerData<Chain>(
    ticker, (t) => `/api/options-chain/${t}${expiry ? `?expiry=${encodeURIComponent(expiry)}` : ""}`);
  const [pickedRaw, setPicked] = useState<Contract | null>(null);
  // A contract stays open only while the chain it came from is the one on screen.
  const picked = pickedRaw && chain && (chain.calls.includes(pickedRaw) || chain.puts.includes(pickedRaw)) ? pickedRaw : null;
  // The chain is scrolled when a row is clicked, so the detail would otherwise
  // open below the fold on the view it replaces.
  const pick = useCallback((c: Contract) => {
    setPicked(c);
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Options Chain"
        subtitle="Quotes, implied volatility and Greeks for every listed contract. Select a row for the detail.">
        <TickerInput value={ticker} onSubmit={setTicker} loading={loading} action="Load chain" />
      </PageHeader>

      {chain?.spot != null && (
        <div style={{ fontFamily: MONO, fontSize: "0.9rem", marginBottom: "1.2rem" }}>
          <span style={{ fontWeight: 600 }}>{chain.ticker}</span>{" "}
          <span style={{ color: "var(--accent-gold)" }}>{money(chain.spot)}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.76rem" }}> · {int(chain.totalContracts)} contracts</span>
        </div>
      )}

      {error && <ErrorNote title={`${ticker} didn't load`} message={lookupErrorText(error)} onRetry={retry} />}
      {loading && !chain && <SkeletonTable rows={12} />}

      {chain && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          {picked ? (
            <Detail c={picked} spot={chain.spot} ticker={chain.ticker} asOf={chain.asOf} onClose={() => setPicked(null)} />
          ) : (
            <>
          <div style={{ ...LABEL, borderBottom: "1px solid var(--border)", paddingBottom: "0.45rem", marginBottom: "0.7rem" }}>
            Expiry
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: "1.4rem" }}>
            {chain.expiries.map((e) => (
              <button key={e} type="button" aria-pressed={e === chain.expiry} onClick={() => setChosen({ ticker: chain.ticker, expiry: e })} style={{
                background: e === chain.expiry ? "var(--accent-gold)" : "var(--bg-elevated)",
                color: e === chain.expiry ? "var(--on-accent)" : "var(--text-secondary)",
                border: "1px solid var(--border)", borderRadius: 999, padding: "0.36rem 0.8rem",
                fontFamily: MONO, fontSize: "0.74rem", cursor: "pointer", whiteSpace: "nowrap",
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
            <Link href="/covered-calls" style={{ color: "var(--accent-gold)" }}>Covered Calls</Link>.
          </div>
        </div>
      )}
    </div>
  );
}

export default function OptionsChainPage() {
  return (
    <Suspense fallback={null}>
      <OptionsChainInner />
    </Suspense>
  );
}
