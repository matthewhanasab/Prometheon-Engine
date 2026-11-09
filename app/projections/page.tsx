"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import { ErrorNote, EmptyNote } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import CompanyLogo from "@/components/CompanyLogo";

// Projections — bull, base and bear five-year scenarios for a stock.
//
// Each scenario is two editable assumptions: how fast earnings per share grow
// and what multiple the market pays at the end. Price = EPS × multiple, so
// the output is an implied price path, the total return against today's
// price and the annualised rate. The defaults are seeded from what the site
// already knows — the analyst consensus for next year's growth where one is
// published, the filed trend otherwise, and today's forward multiple — and
// every input can be changed.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const CARD: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22 };
const DEFAULT_TICKER = "AMD";

type Scenario = "bear" | "base" | "bull";
const SCENARIOS: { key: Scenario; label: string; color: string }[] = [
  { key: "bear", label: "Bear", color: "#F87171" },
  { key: "base", label: "Base", color: "var(--accent-gold)" },
  { key: "bull", label: "Bull", color: "#4ADE80" },
];
type Assumptions = { growth: Record<Scenario, number>; exitPe: Record<Scenario, number>; eps: number; years: number };
// The slices of the research and consensus payloads this page reads.
type StockPayload = {
  ticker: string;
  error?: string;
  quote?: { price?: number | null };
  fundamentals?: { eps?: number | null; peRatio?: number | null };
  forward?: { eps?: number | null; growth?: number | null };
  profile?: { name?: string | null };
};
type Consensus = {
  ntmEps?: number | null; currentYearEps?: number | null; nextYearEpsGrowth?: number | null;
  currentYearLabel?: string | null; nextYearLabel?: string | null; analysts?: number | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;

function defaults(stock: StockPayload | null, consensus: Consensus | null | undefined): Assumptions | null {
  const price: number | null = stock?.quote?.price ?? null;
  const ttmEps: number | null = stock?.fundamentals?.eps ?? null;
  const curYear: number | null = consensus?.currentYearEps ?? null;
  const ntm: number | null = consensus?.ntmEps ?? stock?.forward?.eps ?? null;
  const eps = [curYear, ntm, ttmEps].find((v) => v != null && v > 0) ?? null;
  if (eps == null || !price) return null;
  // A one-year consensus is a poor five-year rate: AMD's analysts expect EPS
  // to double next year off a depressed base, and compounding that for five
  // years gives a number nobody would defend. The seed is the one-year rate
  // blended two-thirds of the way toward a long-run 10%, then capped at 25%.
  const g = consensus?.nextYearEpsGrowth ?? stock?.forward?.growth ?? 0.08;
  const base = clamp(0.35 * g + 0.65 * 0.10, -0.2, 0.25);
  // Exit multiple: today's forward multiple, but a stretched one is not
  // assumed to hold for five years.
  const fwdPe = ntm && ntm > 0 ? price / ntm : stock?.fundamentals?.peRatio ?? null;
  const pe = clamp(fwdPe && fwdPe > 0 ? fwdPe : 18, 8, 30);
  return {
    eps,
    years: 5,
    growth: { bear: Math.max(-0.3, base - 0.08), base, bull: base + 0.08 },
    exitPe: { bear: pe * 0.7, base: pe, bull: pe * 1.2 },
  };
}

function Field({ label, value, onChange, suffix, step = 1, color }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string; step?: number; color?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: color ?? "var(--text-secondary)" }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "0 12px" }}>
        <input type="number" value={Number.isFinite(value) ? Number(value.toFixed(2)) : 0} step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.82rem", padding: "8px 0" }} />
        {suffix && <span style={{ fontFamily: MONO, fontSize: "0.7rem", color: "var(--text-muted)" }}>{suffix}</span>}
      </span>
    </label>
  );
}

function ProjectionsInner() {
  const [urlTicker, setTicker] = useUrlTicker(DEFAULT_TICKER);
  const ticker = urlTicker ?? DEFAULT_TICKER;
  const [attempt, setAttempt] = useState(0);
  // The payload is tagged with the ticker it answers, so a ticker change reads
  // as "loading" by derivation rather than by resetting state inside the
  // effect. Edited assumptions are tagged the same way and fall back to the
  // seeded defaults for any other ticker.
  const [loaded, setLoaded] = useState<{ ticker: string; stock: StockPayload | null; consensus: Consensus | null; error: string | null } | null>(null);
  const [custom, setCustom] = useState<{ ticker: string; a: Assumptions } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`/api/marketstack-stock/${ticker}`).then((r) => r.json()),
      fetch(`/api/consensus/${ticker}`).then((r) => r.json()).catch(() => ({ consensus: null })),
    ]).then(([s, c]) => {
      if (!alive) return;
      if (s?.error) { setLoaded({ ticker, stock: null, consensus: null, error: String(s.error) }); return; }
      setLoaded({ ticker, stock: s, consensus: c?.consensus ?? null, error: null });
    }).catch(() => { if (alive) setLoaded({ ticker, stock: null, consensus: null, error: "Could not load this ticker." }); });
    return () => { alive = false; };
  }, [ticker, attempt]);

  const current = loaded?.ticker === ticker ? loaded : null;
  const stock = current?.stock ?? null;
  const consensus = current?.consensus;
  const error = current?.error ?? null;
  const a: Assumptions | null = useMemo(
    () => (custom?.ticker === ticker ? custom.a : stock ? defaults(stock, consensus) : null),
    [custom, ticker, stock, consensus]
  );
  const setA = (update: (prev: Assumptions | null) => Assumptions | null) => {
    const next = update(a);
    if (next) setCustom({ ticker, a: next });
  };

  const price: number | null = stock?.quote?.price ?? null;
  const rows = useMemo(() => {
    if (!a || !price) return [];
    return Array.from({ length: a.years + 1 }, (_, y) => {
      const row: Record<string, number> = { year: y };
      for (const s of SCENARIOS) {
        const eps = a.eps * Math.pow(1 + a.growth[s.key], y);
        // The multiple glides from the one the market pays today to the exit
        // multiple over the horizon. Applying the exit multiple in full from
        // year one drew a cliff at year one for any stock whose multiple was
        // assumed to compress, which read as a crash the model never meant.
        // The end point, and so the total return, is the same either way.
        const today = a.eps > 0 ? price / a.eps : a.exitPe[s.key];
        const multiple = today + (a.exitPe[s.key] - today) * (y / a.years);
        row[s.key] = y === 0 ? price : eps * multiple;
        row[`${s.key}Eps`] = eps;
      }
      return row;
    });
  }, [a, price]);

  const setGrowth = (k: Scenario, v: number) => setA((p) => p && ({ ...p, growth: { ...p.growth, [k]: v / 100 } }));
  const setPe = (k: Scenario, v: number) => setA((p) => p && ({ ...p, exitPe: { ...p.exitPe, [k]: v } }));
  const loading = !stock && !error;
  const label = (consensus?.nextYearEpsGrowth != null)
    ? `Analysts expect ${pct(consensus.nextYearEpsGrowth, 0)} EPS growth ${consensus.currentYearLabel} → ${consensus.nextYearLabel} (${consensus.analysts} estimates); the base rate blends that toward a long-run 10% since one year rarely holds for five. Bear and bull sit eight points either side.`
    : stock?.forward?.growth != null
    ? "No published consensus for this ticker — the base rate blends the filed earnings trend toward a long-run 10%. Bear and bull sit eight points either side."
    : "";

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Projections"
        subtitle="Bull, base and bear scenarios for the next five years. Change the growth rate and the exit multiple and see what the stock would be worth.">
        <TickerInput value={ticker} onSubmit={setTicker} loading={loading} action="Project" />
      </PageHeader>

      {stock && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.2rem", flexWrap: "wrap" }}>
          <CompanyLogo ticker={stock.ticker} size={30} fallback />
          <h2 style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>{stock.profile?.name ?? stock.ticker}</h2>
          {price && <span style={{ fontFamily: MONO, fontSize: "0.85rem", color: "var(--text-secondary)" }}>{money(price)}</span>}
        </div>
      )}

      {error ? (
        <ErrorNote title={`${ticker} didn't load`}
          message="That symbol isn't in the data, or the data service didn't answer. Check the spelling, or search by company name."
          onRetry={() => { setLoaded(null); setAttempt((n) => n + 1); }} />
      ) : loading ? (
        <>
          <div role="status" aria-label={`Loading ${ticker}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {[0, 1, 2].map((i) => <div key={i} className={`skeleton-bar skeleton-d${i + 1}`} style={{ height: 150, borderRadius: 22 }} />)}
          </div>
        </>
      ) : !a || !price ? (
        <EmptyNote title={`${ticker} has no positive earnings to project from`}>
          A scenario built on losses would be a guess about when they end, not a projection.
          The <Link href={`/research?ticker=${ticker}`} style={{ color: "var(--accent-gold)" }}>research page</Link> has the revenue picture.
        </EmptyNote>
      ) : (
        <>
          {/* Scenario outcomes */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
            {SCENARIOS.map((s) => {
              const last = rows[rows.length - 1];
              const target = last[s.key];
              const total = target / price - 1;
              const cagr = Math.pow(target / price, 1 / a.years) - 1;
              return (
                <div key={s.key} style={{ ...CARD, borderTop: `2px solid ${s.color}`, padding: "14px 18px" }}>
                  <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: s.color }}>{s.label} · year {a.years}</div>
                  <div style={{ fontFamily: MONO, fontSize: "1.7rem", fontWeight: 700, marginTop: 4 }}>{money(target)}</div>
                  <div style={{ fontFamily: MONO, fontSize: "0.78rem", fontWeight: 600, color: total >= 0 ? "var(--positive)" : "var(--negative)" }}>
                    {pct(total, 0)} total · {pct(cagr)}/yr
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 6 }}>
                    EPS {money(last[`${s.key}Eps`])} × {a.exitPe[s.key].toFixed(1)}× exit multiple
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart + assumptions */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)", gap: 12, alignItems: "start" }}>
            <div style={{ ...CARD, padding: "18px 10px 8px" }}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                  <XAxis dataKey="year" tickFormatter={(y: number) => (y === 0 ? "Today" : `Yr ${y}`)} tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => `$${Math.round(v)}`} tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} width={60} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 14, fontFamily: "Spline Sans Mono", fontSize: 12 }}
                    labelFormatter={(y: unknown) => (Number(y) === 0 ? "Today" : `Year ${String(y)}`)}
                    formatter={(v: unknown, name: unknown) => [money(Number(v)), String(name).replace(/^\w/, (c) => c.toUpperCase())]} />
                  <ReferenceLine y={price} stroke="var(--text-muted)" strokeDasharray="4 4" />
                  {SCENARIOS.map((s) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={s.key === "base" ? 2.2 : 1.6} dot={{ r: 2.5 }} isAnimationActive={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...CARD, padding: "16px 18px" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 12 }}>Assumptions</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <Field label="Starting EPS" value={a.eps} step={0.1} suffix="$" onChange={(v) => setA((p) => p && ({ ...p, eps: Math.max(0.01, v) }))} />
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)" }}>Horizon</span>
                  <span style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
                    {[3, 5, 10].map((y) => (
                      <button key={y} type="button" onClick={() => setA((p) => p && ({ ...p, years: y }))}
                        style={{ flex: 1, padding: "5px 0", borderRadius: 999, border: "none", cursor: "pointer", fontFamily: MONO, fontSize: "0.7rem", fontWeight: 700, background: a.years === y ? "var(--accent-gold)" : "transparent", color: a.years === y ? "var(--on-accent)" : "var(--text-secondary)" }}>{y}y</button>
                    ))}
                  </span>
                </label>
              </div>
              {SCENARIOS.map((s) => (
                <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <Field label={`${s.label} EPS growth`} color={s.color} value={a.growth[s.key] * 100} step={1} suffix="%/yr" onChange={(v) => setGrowth(s.key, clamp(v, -60, 100))} />
                  <Field label={`${s.label} exit P/E`} color={s.color} value={a.exitPe[s.key]} step={0.5} suffix="×" onChange={(v) => setPe(s.key, clamp(v, 1, 150))} />
                </div>
              ))}
              <button type="button" onClick={() => setCustom(null)}
                style={{ marginTop: 4, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 999, padding: "7px 14px", fontFamily: SANS, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}>
                Reset to defaults
              </button>
            </div>
          </div>

          {/* Year table */}
          <div style={{ ...CARD, padding: "6px 0", overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
              <thead>
                <tr style={{ color: "var(--text-secondary)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontWeight: 600 }}>Year</th>
                  {SCENARIOS.map((s) => <th key={s.key} style={{ textAlign: "right", padding: "8px 14px", fontWeight: 600, color: s.color }}>{s.label} EPS → price</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.year} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "7px 14px", fontFamily: MONO, color: "var(--text-muted)" }}>{r.year === 0 ? "Today" : r.year}</td>
                    {SCENARIOS.map((s) => (
                      <td key={s.key} style={{ padding: "7px 14px", textAlign: "right", fontFamily: MONO }}>
                        <span style={{ color: "var(--text-secondary)" }}>{money(r[`${s.key}Eps`])}</span>
                        <span style={{ color: "var(--text-muted)" }}> → </span>
                        <span style={{ fontWeight: 600 }}>{money(r[s.key])}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
            {label} Each year&apos;s price is that year&apos;s EPS times a multiple that moves evenly from today&apos;s to the exit multiple. A scenario tool, not a forecast and not advice.
          </div>
        </>
      )}
    </div>
  );
}

export default function ProjectionsPage() {
  return <Suspense fallback={null}><ProjectionsInner /></Suspense>;
}
