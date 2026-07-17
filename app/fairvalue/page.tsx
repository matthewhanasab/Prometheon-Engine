"use client";
import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, d = 2) {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(d);
}
function fmtLarge(n: number | null | undefined) {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n?.toLocaleString()}`;
}

type YearRow = { year: number; date: string; eps: number; dps: number; est: boolean };
type PriceRow = { date: string; price: number };

// Linear interpolation of a per-fiscal-year series at an arbitrary timestamp
function interpAt(t: number, anchors: { t: number; v: number }[]): number | null {
  if (anchors.length === 0) return null;
  if (t <= anchors[0].t) return t === anchors[0].t ? anchors[0].v : null;
  for (let i = 1; i < anchors.length; i++) {
    if (t <= anchors[i].t) {
      const a = anchors[i - 1], b = anchors[i];
      const frac = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * frac;
    }
  }
  return null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 1-2-5 decade steps spanning [lo, hi] — readable ticks for a log axis
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  let dec = Math.floor(Math.log10(lo));
  while (Math.pow(10, dec) <= hi * 10) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, dec);
      if (v >= lo && v <= hi) out.push(v);
    }
    dec++;
  }
  return out;
}
const money = (v: number) => v === 0 ? "$0" : v >= 1 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`;

const SPANS = [
  { key: 5,     label: "5Y" },
  { key: 10,    label: "10Y" },
  { key: 15,    label: "15Y" },
  { key: 999,   label: "MAX" },
];

// ── UI atoms (site idiom) ─────────────────────────────────────────────────────
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600,
      textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem",
      marginBottom: "1rem", marginTop: "2rem",
    }}>
      <span>{children}</span>
      {right}
    </div>
  );
}

function FactRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
      <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.82rem", fontWeight: 600, color: accent ?? "var(--text-primary)", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function KeyChip({ swatch, line, dashed, label }: { swatch?: string; line?: string; dashed?: boolean; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "'Public Sans', sans-serif", fontSize: "0.66rem", color: "var(--text-secondary)" }}>
      {swatch
        ? <span style={{ width: 14, height: 10, background: swatch, borderRadius: 2, display: "inline-block" }} />
        : <span style={{ width: 16, height: 0, borderTop: `2.5px ${dashed ? "dashed" : "solid"} ${line}`, display: "inline-block" }} />}
      {label}
    </span>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
function FairValueInner() {
  const searchParams = useSearchParams();
  const [input, setInput]     = useState("");
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [span, setSpan]       = useState(15);
  const [scaleMode, setScaleMode] = useState<"auto" | "log" | "linear">("auto");

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInput(t.toUpperCase()); load(t.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(sym: string) {
    if (!sym.trim()) return;
    setLoading(true); setError(null); setData(null);
    try {
      const res = await fetch(`/api/fairvalue/${sym.trim().toUpperCase()}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error ?? "load failed");
      setData(json);
    } catch (e: any) {
      setError(e?.message === "No fundamental data for this ticker" || e?.message === "Not enough fiscal-year history"
        ? e.message : "Could not load data. Check the ticker symbol and try again.");
    } finally { setLoading(false); }
  }

  const model = useMemo(() => {
    if (!data) return null;
    const allYears: YearRow[] = data.years ?? [];
    const prices: PriceRow[] = data.prices ?? [];
    const histAll = allYears.filter(y => !y.est);
    const ests    = allYears.filter(y => y.est);
    if (histAll.length < 3 || prices.length < 12) return null;

    // Visible window of historical fiscal years
    const lastHistYear = histAll[histAll.length - 1].year;
    const startYear = span >= 999 ? histAll[0].year : lastHistYear - span + 1;
    const hist = histAll.filter(y => y.year >= startYear);
    if (hist.length < 2) return null;
    const years = [...hist, ...ests];

    // EPS growth (CAGR across the visible window, first→last positive-EPS years)
    const pos = hist.filter(y => y.eps > 0);
    let growth: number | null = null;
    if (pos.length >= 2) {
      const a = pos[0], b = pos[pos.length - 1];
      const n = b.year - a.year;
      if (n > 0) growth = Math.pow(b.eps / a.eps, 1 / n) - 1;
    }

    // Fair value multiple: 15× baseline; growth rate as multiple when growth > 15% (capped 30×)
    const gPct = growth != null ? growth * 100 : null;
    const M = gPct != null && gPct > 15 ? Math.min(gPct, 30) : 15;

    // Normal P/E: median of (avg annual price / EPS) across visible positive-EPS years
    const priceByYear = new Map<number, number[]>();
    for (const p of prices) {
      const y = parseInt(p.date.slice(0, 4));
      if (!priceByYear.has(y)) priceByYear.set(y, []);
      priceByYear.get(y)!.push(p.price);
    }
    const ratios: number[] = [];
    for (const y of pos) {
      const ps = priceByYear.get(y.year);
      if (!ps || ps.length < 3) continue;
      const avg = ps.reduce((s, x) => s + x, 0) / ps.length;
      ratios.push(avg / y.eps);
    }
    let normPE = median(ratios);
    if (normPE != null) normPE = Math.max(5, Math.min(60, normPE));

    // Anchors for interpolation
    const ts = (d: string) => new Date(d).getTime();
    const epsAnchors = years.map(y => ({ t: ts(y.date), v: y.eps }));
    const topAnchors = years.map(y => ({ t: ts(y.date), v: y.eps + y.dps }));
    const lastHistT = ts(hist[hist.length - 1].date);
    const endT = ts(years[years.length - 1].date);
    const startT = ts(hist[0].date);

    // Only draw the dividend band when it is thick enough to see (>=5% payout)
    const hasDivs = years.some(y => y.eps > 0 && y.dps / y.eps >= 0.05);
    const F = (v: number | null, mult: number) => (v == null ? undefined : Math.max(0, v * mult));

    // Chart rows: monthly prices inside the window…
    const rows: any[] = [];
    let priceNow: number | null = null;
    let lastHistRow: any = null;
    for (const p of prices) {
      const t = ts(p.date);
      if (t < startT) continue;
      const e = interpAt(t, epsAnchors);
      const tp = interpAt(t, topAnchors);
      const row: any = { date: p.date, price: p.price };
      if (t <= lastHistT) {
        row.fv = F(e, M); row.top = hasDivs ? F(tp, M) : undefined;
        if (normPE != null) row.nv = F(e, normPE);
        lastHistRow = row;
      } else {
        row.fvE = F(e, M); row.topE = hasDivs ? F(tp, M) : undefined;
        if (normPE != null) row.nvE = F(e, normPE);
      }
      rows.push(row);
      priceNow = p.price;
    }
    // Bridge history → estimates so the solid and dashed sections touch.
    // (Fiscal year-ends never land exactly on a trading date, so this can't be an equality test.)
    if (lastHistRow) {
      lastHistRow.fvE = lastHistRow.fv;
      lastHistRow.topE = lastHistRow.top;
      lastHistRow.nvE = lastHistRow.nv;
    }
    // …then a monthly grid into the estimate future (no price)
    if (rows.length && ests.length) {
      const lastPriceT = ts(rows[rows.length - 1].date);
      const d = new Date(lastPriceT);
      d.setDate(1);
      while (true) {
        d.setMonth(d.getMonth() + 1);
        const t = d.getTime();
        if (t > endT) break;
        const e = interpAt(t, epsAnchors);
        const tp = interpAt(t, topAnchors);
        rows.push({
          date: d.toISOString().slice(0, 10),
          fvE: F(e, M),
          topE: hasDivs ? F(tp, M) : undefined,
          nvE: normPE != null ? F(e, normPE) : undefined,
        });
      }
      // exact endpoint
      const eEnd = years[years.length - 1];
      rows.push({
        date: eEnd.date,
        fvE: F(eEnd.eps, M),
        topE: hasDivs ? F(eEnd.eps + eEnd.dps, M) : undefined,
        nvE: normPE != null ? F(eEnd.eps, normPE) : undefined,
      });
    }

    // ── Axis scale ──
    // A linear axis cannot render a stock whose EPS grew 100×+ (the early years
    // collapse onto zero), so switch to log once the dynamic range gets extreme.
    const SERIES = ["price", "fv", "fvE", "nv", "nvE", "top", "topE"];
    const vals: number[] = [];
    for (const r of rows) for (const k of SERIES) if (typeof r[k] === "number" && r[k] > 0) vals.push(r[k]);
    const vMin = vals.length ? Math.min(...vals) : 1;
    const vMax = vals.length ? Math.max(...vals) : 10;
    const autoLog = vMax / vMin > 50;
    const useLog = scaleMode === "auto" ? autoLog : scaleMode === "log";

    let yDomain: [number, number];
    let yTicks: number[] | undefined;
    if (useLog) {
      const lo = Math.pow(10, Math.floor(Math.log10(vMin)));
      const hi = Math.pow(10, Math.ceil(Math.log10(vMax)));
      yDomain = [lo, hi];
      yTicks = logTicks(lo, hi);
      // Log axes cannot plot 0 — lift non-positive points to the floor so the
      // mountain still touches the baseline in loss years.
      for (const r of rows) for (const k of SERIES) {
        if (typeof r[k] === "number" && r[k] < lo) r[k] = lo;
      }
    } else {
      yDomain = [0, Math.ceil((vMax * 1.05) / 10) * 10];
    }

    // ── X ticks: exactly one per year (thinned to fit) ──
    const firstOfYear: string[] = [];
    let seenYear: number | null = null;
    for (const r of rows) {
      const y = parseInt(String(r.date).slice(0, 4));
      if (y !== seenYear) { firstOfYear.push(r.date); seenYear = y; }
    }
    const step = Math.ceil(firstOfYear.length / 12);
    const xTicks = firstOfYear.filter((_, i) => i % step === 0);

    // Verdict: price vs fair value today
    const nowT = Date.now();
    const epsNow = interpAt(Math.min(nowT, endT), epsAnchors);
    const fvNow = epsNow != null ? epsNow * M : null;
    let verdict: { label: string; tone: "good" | "bad" | "neutral" } | null = null;
    let ratio: number | null = null;
    if (fvNow && fvNow > 0 && priceNow) {
      ratio = priceNow / fvNow;
      verdict = ratio < 0.9  ? { label: "Undervalued",  tone: "good" }
              : ratio <= 1.1 ? { label: "Fairly Valued", tone: "neutral" }
              :                { label: "Overvalued",    tone: "bad" };
    }

    // Forecast: price migrates to fair value by the last estimate year end
    let forecast: { endYear: number; endFV: number; totalRet: number; annRet: number; divs: number } | null = null;
    if (ests.length && priceNow) {
      const eEnd = ests[ests.length - 1];
      const yearsTo = (ts(eEnd.date) - nowT) / (365.25 * 24 * 3600 * 1000);
      if (yearsTo > 0.25) {
        const endFV = eEnd.eps * M;
        const divs = ests.reduce((s, y) => s + y.dps, 0) * Math.min(1, yearsTo / ests.length);
        const totalRet = (endFV + divs - priceNow) / priceNow;
        const annRet = Math.pow((endFV + divs) / priceNow, 1 / yearsTo) - 1;
        forecast = { endYear: eEnd.year, endFV, totalRet, annRet, divs };
      }
    }

    // Blended P/E: last reported EPS blended toward the current-year estimate
    const lastEps = hist[hist.length - 1].eps;
    const nextEst = ests[0];
    let blendedEps = lastEps;
    if (nextEst) {
      const frac = Math.max(0, Math.min(1, (nowT - lastHistT) / (ts(nextEst.date) - lastHistT)));
      blendedEps = lastEps + (nextEst.eps - lastEps) * frac;
    }
    const blendedPE = priceNow && blendedEps > 0 ? priceNow / blendedEps : null;

    const lastDps = hist[hist.length - 1].dps;
    return {
      rows, years, hist, ests, M, normPE, growth, verdict, ratio, forecast, hasDivs,
      useLog, yDomain, yTicks, xTicks,
      blendedPE, epsYield: priceNow && blendedEps ? blendedEps / priceNow : null,
      divYield: priceNow && lastDps ? lastDps / priceNow : null,
    };
  }, [data, span, scaleMode]);

  const toneColor = (t: string) => t === "good" ? "var(--positive)" : t === "bad" ? "var(--negative)" : "var(--accent-gold)";

  return (
    <div style={{ paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
        Fair Value Graph
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right,var(--accent-gold),transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.5rem" }} />
      <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "1.5rem", fontFamily: "'Public Sans', sans-serif" }}>
        Price vs. the value its earnings justify — the mountain is EPS × a fair multiple; when the price line dips below it, the market may be underpricing the business.
      </div>

      <form onSubmit={e => { e.preventDefault(); load(input); }} style={{ display: "flex", gap: 10, marginBottom: "2rem", maxWidth: 380 }}>
        <input value={input} onChange={e => setInput(e.target.value.toUpperCase())} placeholder="Ticker"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", cursor: "pointer" }}>Analyze</button>
      </form>

      {loading && <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "40px 0" }}>Loading {input}…</div>}
      {error && <div style={{ color: "var(--negative)", fontSize: "0.85rem" }}>{error}</div>}

      {!loading && !data && !error && (
        <div style={{ border: "1px dashed var(--border-active)", borderRadius: 22, background: "var(--bg-surface)", padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.05rem", color: "var(--text-primary)", marginBottom: 8 }}>Earnings and price, one picture</div>
          <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 520, margin: "0 auto", lineHeight: 1.7 }}>
            Type a ticker to draw up to 20 years of the stock price over its earnings-justified value,
            with analyst estimates extending the picture three years forward.
          </div>
        </div>
      )}

      {data && model && (
        <>
          {/* Company + verdict */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.5rem", fontWeight: 500, color: "var(--text-primary)" }}>{data.name}</span>
            <span style={{ fontFamily: "'Spline Sans Mono',monospace", fontSize: "1.25rem", fontWeight: 600, color: "var(--text-primary)" }}>${fmt(data.price)}</span>
            {model.verdict && (
              <span style={{
                fontFamily: "'Public Sans', sans-serif", fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                color: toneColor(model.verdict.tone), border: `1px solid ${toneColor(model.verdict.tone)}55`,
                background: "var(--bg-elevated)", borderRadius: 999, padding: "4px 12px",
              }}>
                {model.verdict.label}{model.ratio != null ? ` — ${(model.ratio * 100).toFixed(0)}% of fair value` : ""}
              </span>
            )}
          </div>
          <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "1.25rem" }}>
            {[data.ticker, data.sector, `Mkt cap ${fmtLarge(data.mktCap)}`].filter(Boolean).join(" · ")}
          </div>

          {/* Chart card */}
          <SectionLabel right={
            <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
                {([["log", "Log"], ["linear", "Linear"]] as const).map(([k, label]) => {
                  const active = model.useLog === (k === "log");
                  return (
                    <button key={k} type="button" onClick={() => setScaleMode(k)} title={k === "log" ? "Log scale — equal % moves take equal vertical space" : "Linear scale — equal $ moves take equal vertical space"} style={{
                      padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em",
                      background: active ? "var(--accent-gold)" : "transparent",
                      color: active ? "var(--on-accent)" : "var(--text-secondary)",
                    }}>{label}</button>
                  );
                })}
              </div>
              <div style={{ display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: 3, gap: 2 }}>
                {SPANS.map(s => (
                  <button key={s.key} type="button" onClick={() => setSpan(s.key)} style={{
                    padding: "5px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                    fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em",
                    background: span === s.key ? "var(--accent-gold)" : "transparent",
                    color: span === s.key ? "var(--on-accent)" : "var(--text-secondary)",
                  }}>{s.label}</button>
                ))}
              </div>
            </div>
          }>Price vs. Earnings-Justified Value</SectionLabel>

          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "18px 14px 10px" }}>
            {/* Graph key */}
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", padding: "0 6px 12px" }}>
              <KeyChip line="var(--text-primary)" label="Price" />
              <KeyChip line="var(--fv-line)" label={`Fair value — ${model.M.toFixed(model.M % 1 ? 1 : 0)}× earnings`} />
              {model.normPE != null && <KeyChip line="var(--accent-gold)" label={`Normal P/E — ${model.normPE.toFixed(1)}×`} />}
              <KeyChip swatch="var(--fv-fill)" label="Earnings mountain" />
              {model.hasDivs && <KeyChip swatch="var(--fv-top)" label="Dividends on top" />}
              {model.ests.length > 0 && <KeyChip line="var(--fv-line)" dashed label="Analyst estimates" />}
            </div>

            <ResponsiveContainer width="100%" height={440}>
              <ComposedChart data={model.rows} margin={{ top: 6, right: 14, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis dataKey="date" tick={{ fill: "var(--tick)", fontSize: 11, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false}
                  ticks={model.xTicks} interval={0} tickFormatter={(d: any) => String(d).slice(0, 4)} />
                <YAxis tickFormatter={(v: any) => money(Number(v))} tick={{ fill: "var(--tick)", fontSize: 11, fontFamily: "Spline Sans Mono" }} axisLine={false} tickLine={false} width={58}
                  scale={model.useLog ? "log" : "linear"} domain={model.yDomain} ticks={model.yTicks} allowDataOverflow />
                <Tooltip
                  labelStyle={{ color: "var(--text-primary)" }} itemStyle={{ color: "var(--text-primary)" }}
                  contentStyle={{ background: "var(--tooltip-bg)", border: "1px solid var(--tooltip-border)", borderRadius: 22, fontFamily: "Spline Sans Mono", fontSize: 12 }}
                  formatter={(v: any, name: any) => {
                    const labels: Record<string, string> = {
                      price: "Price", fv: "Fair value", fvE: "Fair value (est)",
                      nv: "Normal P/E value", nvE: "Normal P/E (est)",
                      top: "Earnings + dividends", topE: "Earnings + dividends (est)",
                    };
                    return [`$${Number(v).toFixed(2)}`, labels[name] ?? name];
                  }}
                />
                {/* dividend topper behind, mountain in front */}
                {model.hasDivs && <Area type="linear" dataKey="top"  baseValue={model.yDomain[0]} stroke="none" fill="var(--fv-top)" fillOpacity={1} isAnimationActive={false} connectNulls={false} />}
                {model.hasDivs && <Area type="linear" dataKey="topE" baseValue={model.yDomain[0]} stroke="none" fill="var(--fv-top)" fillOpacity={0.55} isAnimationActive={false} connectNulls={false} />}
                <Area type="linear" dataKey="fv"  baseValue={model.yDomain[0]} stroke="var(--fv-line)" strokeWidth={2.2} fill="var(--fv-fill)" fillOpacity={1} isAnimationActive={false} connectNulls={false} dot={false} />
                <Area type="linear" dataKey="fvE" baseValue={model.yDomain[0]} stroke="var(--fv-line)" strokeWidth={2} strokeDasharray="6 4" fill="var(--fv-fill-est)" fillOpacity={1} isAnimationActive={false} connectNulls={false} dot={false} />
                {model.normPE != null && <Line type="linear" dataKey="nv"  stroke="var(--accent-gold)" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls={false} />}
                {model.normPE != null && <Line type="linear" dataKey="nvE" stroke="var(--accent-gold)" strokeWidth={1.4} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls={false} />}
                <Line type="linear" dataKey="price" stroke="var(--text-primary)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Facts + forecast */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12, marginTop: "1.25rem" }}>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "16px 18px" }}>
              <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 8 }}>Fast Facts</div>
              <FactRow label="Blended P/E" value={model.blendedPE != null ? `${model.blendedPE.toFixed(2)}×` : "N/A"} />
              <FactRow label="EPS yield" value={model.epsYield != null ? `${(model.epsYield * 100).toFixed(2)}%` : "N/A"} />
              <FactRow label="Dividend yield" value={model.divYield != null ? `${(model.divYield * 100).toFixed(2)}%` : "—"} />
              <FactRow label="EPS growth rate (window)" value={model.growth != null ? `${(model.growth * 100).toFixed(2)}%` : "N/A"}
                accent={model.growth != null ? (model.growth >= 0 ? "var(--positive)" : "var(--negative)") : undefined} />
              <FactRow label="Fair value ratio" value={`${model.M.toFixed(model.M % 1 ? 1 : 0)}×`} accent="var(--fv-line)" />
              <FactRow label="Normal P/E ratio" value={model.normPE != null ? `${model.normPE.toFixed(1)}×` : "N/A"} accent="var(--accent-gold)" />
            </div>

            {model.forecast && (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "16px 18px" }}>
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.60rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", marginBottom: 8 }}>
                  If price meets fair value by FY{model.forecast.endYear}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 0 4px" }}>
                  <span style={{ fontFamily: "'Spline Sans Mono',monospace", fontSize: "1.9rem", fontWeight: 600, color: model.forecast.annRet >= 0 ? "var(--positive)" : "var(--negative)" }}>
                    {model.forecast.annRet >= 0 ? "+" : ""}{(model.forecast.annRet * 100).toFixed(1)}%
                  </span>
                  <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.68rem", color: "var(--text-secondary)" }}>annualized</span>
                </div>
                <FactRow label={`Fair value at FY${model.forecast.endYear} EPS`} value={`$${model.forecast.endFV.toFixed(2)}`} accent="var(--fv-line)" />
                {model.hasDivs && <FactRow label="Estimated dividends collected" value={`$${model.forecast.divs.toFixed(2)}`} />}
                <FactRow label="Total return to fair value" value={`${model.forecast.totalRet >= 0 ? "+" : ""}${(model.forecast.totalRet * 100).toFixed(1)}%`}
                  accent={model.forecast.totalRet >= 0 ? "var(--positive)" : "var(--negative)"} />
                <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10, lineHeight: 1.6 }}>
                  Assumes the price converges to {model.M.toFixed(0)}× the FY{model.forecast.endYear} analyst EPS estimate. Estimates change; this is a framework, not a promise.
                </div>
              </div>
            )}
          </div>

          {/* Per-year table */}
          <SectionLabel>Earnings &amp; Dividends by Fiscal Year</SectionLabel>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 22 }}>
            <table style={{ borderCollapse: "collapse", fontFamily: "'Spline Sans Mono',monospace", fontSize: "0.76rem", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", position: "sticky", left: 0, background: "var(--bg-primary)" }}>FY</th>
                  {model.years.map(y => (
                    <th key={y.year} style={{ textAlign: "right", padding: "8px 12px", fontWeight: 700, color: y.est ? "var(--accent-gold)" : "var(--text-primary)", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                      {y.year}{y.est ? "E" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: "8px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", color: "var(--text-secondary)", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--bg-primary)" }}>EPS</td>
                  {model.years.map(y => (
                    <td key={y.year} style={{ textAlign: "right", padding: "8px 12px", color: y.est ? "var(--accent-gold)" : "var(--text-primary)", whiteSpace: "nowrap" }}>{y.eps.toFixed(2)}</td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: "8px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", color: "var(--text-secondary)", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--bg-primary)" }}>Chg/Yr</td>
                  {model.years.map((y, i) => {
                    const prev = model.years[i - 1];
                    const chg = prev && prev.eps > 0 && y.eps != null ? ((y.eps - prev.eps) / Math.abs(prev.eps)) * 100 : null;
                    return (
                      <td key={y.year} style={{ textAlign: "right", padding: "8px 12px", color: chg == null ? "var(--text-muted)" : chg >= 0 ? "var(--positive)" : "var(--negative)", whiteSpace: "nowrap" }}>
                        {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(0)}%`}
                      </td>
                    );
                  })}
                </tr>
                {model.hasDivs && (
                  <tr>
                    <td style={{ padding: "8px 14px", fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", color: "var(--text-secondary)", whiteSpace: "nowrap", position: "sticky", left: 0, background: "var(--bg-primary)" }}>Div</td>
                    {model.years.map(y => (
                      <td key={y.year} style={{ textAlign: "right", padding: "8px 12px", color: y.est ? "var(--accent-gold)" : "var(--text-secondary)", whiteSpace: "nowrap" }}>{y.dps ? y.dps.toFixed(2) : "0.00"}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginTop: 10 }}>
            Diluted EPS by fiscal year; dividends are split-adjusted sums by ex-date year. Years marked E are analyst consensus estimates.
          </div>
        </>
      )}

      {data && !model && !loading && (
        <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
          Not enough history to build the fair value model for this ticker.
        </div>
      )}
    </div>
  );
}

export default function FairValuePage() {
  return <Suspense fallback={null}><FairValueInner /></Suspense>;
}
