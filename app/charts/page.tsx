"use client";
import React, { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer, BarChart, Bar, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, LabelList,
} from "recharts";

import PageHeader from "@/components/PageHeader";
import TickerInput from "@/components/TickerInput";
import SectionNav from "@/components/SectionNav";
import CompanyLogo from "@/components/CompanyLogo";
import { ErrorNote } from "@/components/States";
import { useUrlTicker } from "@/lib/useUrlTicker";
import { useTickerData, lookupErrorText } from "@/lib/useTickerData";
import { loadDirectory } from "@/lib/tickerDirectory";
import {
  SANS, DISPLAY, MONO, money, count, axisCompact, dollars, pct, times, signedPct,
  xAxis, yAxis, grid, barCursor, lineCursor, activeDot,
  ChartTip, changeNote, Delta, Segmented, ChartCard, StatCell, type LegendItem,
} from "@/components/charts/kit";

// Financial Charts: a company's filings, drawn.
//
// Quarterly fundamentals come from SEC EDGAR XBRL; the valuation multiples
// pair those against quarter-end closing prices. The page leads with the
// trailing-year figures, then walks the statements group by group. Every chart
// card states its latest value and the change on the year, so the plot is
// there to show the shape, not to be read bar by bar.

type Pt = { date: string; label: string; value: number };
type Row = Pt & { qoq: number | null; yoy: number | null; yoyLabel: string | null };
type Group = { q: Pt[]; ttm: Pt[] };
type View = "q" | "ttm";
type Range = "3y" | "5y" | "all";

const QUARTERS: Record<Range, number> = { "3y": 12, "5y": 20, all: 400 };
const RANGES: { value: Range; label: string; title: string }[] = [
  { value: "3y", label: "3Y", title: "3 years" },
  { value: "5y", label: "5Y", title: "5 years" },
  { value: "all", label: "All", title: "All available" },
];

const DAY = 864e5;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** The point roughly `back` days before rows[i], if the filer reported one. */
function earlier(rows: Pt[], i: number, back: number, tolerance: number): Pt | null {
  for (let j = i - 1; j >= 0; j--) {
    const g = daysBetween(rows[j].date, rows[i].date);
    if (Math.abs(g - back) <= tolerance) return rows[j];
    if (g > back + tolerance) break;
  }
  return null;
}
/** A change as a fraction. A base at or below zero has no meaningful percentage. */
const change = (now: number, then: number | null | undefined) =>
  then == null || !(then > 0) ? null : (now - then) / then;

/** Each point with its change on the prior quarter and on the same quarter a year before. */
function enrich(rows: Pt[] | undefined): Row[] {
  const src = rows ?? [];
  return src.map((p, i) => {
    const prev = earlier(src, i, 91, 24), year = earlier(src, i, 365, 24);
    return { ...p, qoq: change(p.value, prev?.value), yoy: change(p.value, year?.value), yoyLabel: year?.label ?? null };
  });
}

/**
 * Compound yearly rate over the last `quarters` of a series, when both ends are
 * positive. The start is found by date, not by position, so a series with a
 * missing quarter can't stretch "5 years" into five and a half.
 */
function yearlyRate(rows: Pt[], quarters: number): { rate: number; years: number } | null {
  if (rows.length < 5) return null;
  const b = rows[rows.length - 1];
  const a = quarters >= rows.length
    ? rows[0]
    : earlier(rows, rows.length - 1, Math.round(quarters * 91.31), 40);
  if (!a) return null;
  const years = daysBetween(a.date, b.date) / 365.25;
  if (!(a.value > 0) || !(b.value > 0) || years < 1.5) return null;
  return { rate: Math.pow(b.value / a.value, 1 / years) - 1, years };
}
/** "Gross, operating and net margin", from whichever of the three the filer reports. */
const marginTitle = (names: string[]) => {
  if (!names.length) return "Margins";
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return `${list.charAt(0)}${list.slice(1).toLowerCase()} margin`;
};
const yearsText = (y: number) => {
  const r = Math.round(y * 2) / 2;
  return `${Number.isInteger(r) ? r : r.toFixed(1)} year${r === 1 ? "" : "s"}`;
};
const rateText = (r: { rate: number; years: number } | null) =>
  r ? `${r.rate >= 0 ? "Up" : "Down"} ${Math.abs(r.rate * 100).toFixed(Math.abs(r.rate) >= 1 ? 0 : 1)}% a year over ${yearsText(r.years)}` : null;

const endDate = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);

// ── Plots ────────────────────────────────────────────────────────────────────

function NoSeries({ children = "Not reported in this company's filings." }: { children?: React.ReactNode }) {
  return (
    <div style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6, padding: "28px 4px 34px", maxWidth: "52ch" }}>
      {children}
    </div>
  );
}

/**
 * One series as columns. Pointing at a quarter keeps it and the same quarter a
 * year earlier lit and dims the rest: the comparison the readout is quoting.
 */
function BarsPlotImpl({ rows, fmt, axisFmt, height }: {
  rows: Row[]; fmt: (v: number) => string; axisFmt: (v: number) => string; height: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const paired = hover != null ? rows.findIndex((r) => r.label === rows[hover]?.yoyLabel) : -1;
  const dips = rows.some((r) => r.value < 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 6, right: 14, left: 0, bottom: 0 }} barCategoryGap="24%"
        onMouseMove={(st: any) => {
          const i = st?.isTooltipActive ? Number(st.activeTooltipIndex) : NaN;
          setHover(Number.isFinite(i) ? i : null);
        }}
        onMouseLeave={() => setHover(null)}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...xAxis} />
        <YAxis {...yAxis} tickFormatter={axisFmt} />
        {dips && <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} />}
        <Tooltip isAnimationActive={false} cursor={barCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
          content={<ChartTip build={(r: Row) => ({
            title: r.label, sub: endDate(r.date), rows: [{ value: fmt(r.value) }],
            notes: [...changeNote("vs prior quarter", r.qoq), ...changeNote(`vs ${r.yoyLabel ?? "year ago"}`, r.yoy)],
          })} />} />
        <Bar dataKey="value" fill="var(--series-1)" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell key={r.date} fillOpacity={hover == null || i === hover || i === paired ? 1 : 0.3} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** One series as a line over a faint wash, with its own average ruled across. */
function TrendPlotImpl({ rows, fmt, axisFmt, height, average, fromZero = false }: {
  rows: Row[]; fmt: (v: number) => string; axisFmt: (v: number) => string; height: number;
  average?: number; fromZero?: boolean;
}) {
  const end = last(rows);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...xAxis} />
        <YAxis {...yAxis} tickFormatter={axisFmt} domain={fromZero ? [0, "auto"] : ["auto", "auto"]} />
        <Tooltip isAnimationActive={false} cursor={lineCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
          content={<ChartTip build={(r: Row) => ({
            title: r.label, sub: endDate(r.date), rows: [{ value: fmt(r.value) }],
            notes: average != null && average > 0
              ? changeNote("vs average", (r.value - average) / average).map((n) => ({ ...n, tone: "flat" as const }))
              : changeNote(`vs ${r.yoyLabel ?? "year ago"}`, r.yoy).map((n) => ({ ...n, tone: "flat" as const })),
          })} />} />
        {average != null && <ReferenceLine y={average} stroke="var(--text-muted)" strokeDasharray="3 4" />}
        <Area type="linear" dataKey="value" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round"
          fill="var(--series-1)" fillOpacity={0.1} isAnimationActive={false}
          activeDot={{ ...activeDot, fill: "var(--series-1)" }} />
        {end && <ReferenceDot x={end.label} y={end.value} r={4} fill="var(--series-1)" stroke="var(--surface-solid)" strokeWidth={2} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

type Keyed = { label: string; date: string } & Record<string, number | string | null>;
type SeriesDef = { key: string; name: string; color: string };
type Flow = { q: Row[]; ttm: Row[] };
/** What <Headline> reads from the page's derived series. */
type Derived = { revenue: Flow; ocf: Flow; fcf: Flow; eps: Flow; pe: Row[]; margins: { q: Keyed[]; ttm: Keyed[] }; funds: Keyed[] };

/** Several series as lines on one axis; the readout lists all of them at the pointer. */
function LinesPlotImpl({ rows, series, fmt, axisFmt, height }: {
  rows: Keyed[]; series: SeriesDef[]; fmt: (v: number) => string; axisFmt: (v: number) => string; height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...xAxis} />
        <YAxis {...yAxis} tickFormatter={axisFmt} />
        <Tooltip isAnimationActive={false} cursor={lineCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
          content={<ChartTip build={(r: Keyed) => ({
            title: r.label, sub: endDate(r.date),
            rows: series.filter((s) => r[s.key] != null).map((s) => ({ color: s.color, name: s.name, value: fmt(r[s.key] as number) })),
          })} />} />
        {series.map((s) => (
          <Line key={s.key} type="linear" dataKey={s.key} stroke={s.color} strokeWidth={2} strokeLinejoin="round"
            dot={false} connectNulls isAnimationActive={false} activeDot={{ ...activeDot, fill: s.color }} />
        ))}
        {series.map((s) => {
          const end = [...rows].reverse().find((r) => r[s.key] != null);
          return end ? <ReferenceDot key={s.key} x={end.label} y={end[s.key] as number} r={4} fill={s.color} stroke="var(--surface-solid)" strokeWidth={2} /> : null;
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Several series as columns: side by side, or stacked where `stack` names a pile. */
function ColumnsPlotImpl({ rows, series, fmt, axisFmt, height, footer }: {
  rows: Keyed[]; series: (SeriesDef & { stack?: string })[];
  fmt: (v: number) => string; axisFmt: (v: number) => string; height: number;
  footer?: (r: Keyed) => { name: string; value: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ top: 6, right: 14, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={2}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...xAxis} />
        <YAxis {...yAxis} tickFormatter={axisFmt} />
        <Tooltip isAnimationActive={false} cursor={barCursor} wrapperStyle={{ outline: "none", zIndex: 5 }}
          content={<ChartTip build={(r: Keyed) => ({
            title: r.label, sub: endDate(r.date),
            rows: series.filter((s) => r[s.key] != null).map((s) => ({ color: s.color, name: s.name, value: fmt(r[s.key] as number) })),
            notes: footer?.(r).map((n) => ({ ...n, tone: "flat" as const })),
          })} />} />
        {series.map((s, i) => {
          // In a pile only the top segment is rounded; a hairline in the card
          // colour keeps the segments apart without a border of their own.
          const top = !s.stack || !series.slice(i + 1).some((o) => o.stack === s.stack);
          return (
            <Bar key={s.key} dataKey={s.key} stackId={s.stack} fill={s.color} maxBarSize={16} isAnimationActive={false}
              radius={top ? [3, 3, 0, 0] : 0} stroke={s.stack ? "var(--surface-solid)" : undefined} strokeWidth={s.stack ? 1 : 0} />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}

// The plots are memoised on their data. recharts rebuilds every mark whenever
// its chart re-renders, so without this an unrelated update to the page (the
// company name arriving, the segment report loading) would throw away bars in
// the middle of their draw-in and restart every hover transition. The format
// functions are left out of the comparison: they belong to the card and never
// change over its life.
const sameRows = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameKeys = (a: SeriesDef[], b: SeriesDef[]) => a.length === b.length && a.every((x, i) => x.key === b[i].key);
const BarsPlot = React.memo(BarsPlotImpl, (a, b) => a.height === b.height && sameRows(a.rows, b.rows));
const TrendPlot = React.memo(TrendPlotImpl, (a, b) =>
  a.height === b.height && a.average === b.average && a.fromZero === b.fromZero && sameRows(a.rows, b.rows));
const LinesPlot = React.memo(LinesPlotImpl, (a, b) => a.height === b.height && sameKeys(a.series, b.series) && sameRows(a.rows, b.rows));
const ColumnsPlot = React.memo(ColumnsPlotImpl, (a, b) => a.height === b.height && sameKeys(a.series, b.series) && sameRows(a.rows, b.rows));

// ── Segments ─────────────────────────────────────────────────────────────────

type SegSlice = { label: string; value: number };
type SegBreakdown = { periodEnd: string; slices: SegSlice[]; coverage: number | null };
type SegmentsPayload = {
  found: boolean; reason?: string; ticker?: string; filed?: string | null;
  product?: SegBreakdown | null; geography?: SegBreakdown | null; segment?: SegBreakdown | null;
};

const SEG_ROW = 46;

/**
 * Ranked lines of revenue: the name and its figures on one line, a thin bar
 * beneath. One colour, because the lines are compared by length, and the names
 * sit over the bars so the bars keep the full width on a phone.
 */
function SegmentPlot({ slices }: { slices: SegSlice[] }) {
  const [width, setWidth] = useState(0);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const max = Math.max(...slices.map((s) => s.value), 1);
  // Room for the name before it would run into the figures at the right.
  const nameChars = Math.max(10, Math.floor((width - 150) / 6.6));
  const label = (props: any) => {
    const { x = 0, y = 0, index = 0 } = props;
    const s = slices[index];
    if (!s || !width) return null;
    const name = s.label.length > nameChars ? `${s.label.slice(0, nameChars - 1).trimEnd()}…` : s.label;
    return (
      <g>
        <text x={x} y={y - 8} fontFamily="Public Sans, sans-serif" fontSize={12.5} fontWeight={500} fill="var(--text-primary)">{name}</text>
        <text x={width - 2} y={y - 8} textAnchor="end" fontFamily="Spline Sans Mono, monospace" fontSize={12}>
          <tspan fill="var(--text-primary)" fontWeight={600}>{money(s.value, 1)}</tspan>
          <tspan fill="var(--text-muted)" dx={8}>{pct((s.value / total) * 100, 1)}</tspan>
        </text>
      </g>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={slices.length * SEG_ROW + 4} onResize={(w) => setWidth(w)}>
      <BarChart data={slices} layout="vertical" margin={{ top: 8, right: 2, left: 2, bottom: 0 }} barCategoryGap={0}>
        <XAxis type="number" hide domain={[0, max]} />
        <YAxis type="category" dataKey="label" hide />
        <Bar dataKey="value" fill="var(--series-1)" barSize={8} radius={4} isAnimationActive={false}
          background={{ fill: "var(--bg-elevated)", radius: 4 }}>
          <LabelList dataKey="value" content={label} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SegmentCard({ id, title, what, state, breakdown, reason, ticker, company }: {
  id?: string; title: string; what: string;
  state: "loading" | "ready"; breakdown?: SegBreakdown | null; reason?: string;
  ticker: string; company?: string;
}) {
  if (state === "loading") {
    return (
      <ChartCard id={id} title={title} shot={false}>
        <div role="status" aria-label={`Loading ${title.toLowerCase()}`} style={{ display: "grid", gap: 22, padding: "8px 0 20px" }}>
          {[92, 64, 48, 30].map((w, i) => (
            <div key={i} className={`skeleton-bar skeleton-d${(i % 3) + 1}`} style={{ height: 8, width: `${w}%`, borderRadius: 4 }} />
          ))}
        </div>
      </ChartCard>
    );
  }
  if (!breakdown || !breakdown.slices.length) {
    return (
      <ChartCard id={id} title={title} shot={false}>
        <NoSeries>{reason ?? `This filer discloses no ${what} revenue split in its latest annual report.`}</NoSeries>
      </ChartCard>
    );
  }
  const slices = [...breakdown.slices].sort((a, b) => b.value - a.value);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const lead = slices[0];
  const partial = breakdown.coverage != null && breakdown.coverage < 0.95;
  return (
    <ChartCard id={id} title={title} ticker={ticker} company={company}
      figure={pct((lead.value / total) * 100, 0)}
      delta={<span style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-secondary)" }}>from {lead.label}</span>}
      caption={`Fiscal year ended ${endDate(breakdown.periodEnd)} · ${money(total, 1)} across ${slices.length} lines`}
      note={partial ? `These lines cover ${Math.round((breakdown.coverage ?? 0) * 100)}% of revenue. The filer doesn't break out the rest.` : undefined}>
      <SegmentPlot slices={slices} />
    </ChartCard>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "growth", label: "Growth" },
  { id: "cash", label: "Cash" },
  { id: "per-share", label: "Per share" },
  { id: "margins", label: "Margins" },
  { id: "valuation", label: "Valuation" },
  { id: "capital", label: "Capital" },
  { id: "segments", label: "Segments" },
  { id: "balance", label: "Balance sheet" },
];

function GroupHead({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div className="chart-group-head">
      <h2 id={id} style={{ fontFamily: DISPLAY, fontSize: "1.2rem", fontWeight: 500, letterSpacing: "-0.015em", margin: 0, color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-muted)", margin: 0 }}>{children}</p>
    </div>
  );
}

function LoadingCharts() {
  return (
    <div role="status" aria-label="Loading charts">
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
        <div className="skeleton-bar" style={{ width: 44, height: 44, borderRadius: 11 }} />
        <div style={{ display: "grid", gap: 8 }}>
          <div className="skeleton-bar" style={{ height: 18, width: 190 }} />
          <div className="skeleton-bar skeleton-d1" style={{ height: 11, width: 260 }} />
        </div>
      </div>
      <div className="skeleton-bar skeleton-d1" style={{ height: 132, borderRadius: 22 }} />
      <div className="chart-grid" style={{ marginTop: 40 }}>
        <div className="skeleton-bar skeleton-d2 chart-card-wide" style={{ height: 400, borderRadius: 22 }} />
        <div className="skeleton-bar skeleton-d3" style={{ height: 330, borderRadius: 22 }} />
        <div className="skeleton-bar skeleton-d1" style={{ height: 330, borderRadius: 22 }} />
      </div>
    </div>
  );
}

function ChartsInner() {
  const [urlTicker, setUrlTicker] = useUrlTicker("AAPL");
  const { data, shown, loading, stale, error, retry } = useTickerData<any>(urlTicker, (t) => `/api/ms-charts/${t}`);
  // The ticker the charts on screen belong to.
  const ticker = shown ?? "";

  // Period and range are part of the address too, so a view can be shared.
  const search = useSearchParams();
  const view: View = search.get("view") === "ttm" ? "ttm" : "q";
  const rangeParam = search.get("range");
  const range: Range = rangeParam === "3y" || rangeParam === "all" ? rangeParam : "5y";
  const setParam = (key: string, value: string, fallback: string) => {
    const p = new URLSearchParams(window.location.search);
    if (value === fallback) p.delete(key); else p.set(key, value);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };
  const n = QUARTERS[range];
  // Each chart can also be given its own range from the switch in its card.
  // Choosing a range for the whole page clears those, so the page control
  // always means "everything".
  const [own, setOwn] = useState<Record<string, Range>>({});
  const nOf = (card: string) => QUARTERS[own[card] ?? range];
  /** Changes when a card is redrawn on purpose, so its draw-in replays. */
  const motionKey = (card: string) => `${view}-${own[card] ?? range}`;
  const rangeSwitch = (card: string) => (
    <Segmented size="sm" label={`Range for ${card.toLowerCase()}`} value={own[card] ?? range} options={RANGES}
      onChange={(v) => setOwn((o) => ({ ...o, [card]: v }))} />
  );

  // Segment revenue comes from the 10-K's XBRL instance, which is a whole
  // filing (1.4MB for Apple, 15MB for JPMorgan), so it loads after the page
  // paints and nothing else waits on it.
  const [segments, setSegments] = useState<SegmentsPayload | null>(null);
  const seg = segments?.ticker === ticker ? segments : null;
  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    fetch(`/api/segments/${ticker}`)
      .then((r) => r.json())
      .then((j) => { if (alive) setSegments({ ...j, ticker }); })
      .catch(() => { if (alive) setSegments({ found: false, ticker }); });
    return () => { alive = false; };
  }, [ticker]);

  // The filing name is in capitals ("NVIDIA CORP"); the directory has the name
  // people use.
  const [names, setNames] = useState<Map<string, string> | null>(null);
  useEffect(() => { loadDirectory().then((d) => setNames(new Map(d))); }, []);

  const s = data?.series;
  const company: string | undefined = (ticker && names?.get(ticker)) || data?.profile?.companyName;

  // Everything the page draws, derived once per company.
  const m = useMemo(() => {
    if (!s) return null;
    const flow = (g: Group | undefined) => ({ q: enrich(g?.q), ttm: enrich(g?.ttm) });
    const revenue = flow(s.revenue), ocf = flow(s.ocf), operatingIncome = flow(s.operatingIncome),
      netIncome = flow(s.netIncome), eps = flow(s.eps), fcf = flow(s.fcf), fcfPerShare = flow(s.fcfPerShare);

    // Margins, quarterly and trailing-year. Gross profit is rebuilt from the
    // gross margin the feed gives, so the trailing figure is a true ratio of
    // sums rather than an average of four quarterly percentages.
    const marginsFor = (v: View): Keyed[] => {
      const rev = new Map<string, number>((v === "ttm" ? s.revenue?.ttm ?? [] : s.revenue?.q ?? []).map((p: Pt) => [p.date, p.value]));
      const revQ = new Map<string, number>((s.revenue?.q ?? []).map((p: Pt) => [p.date, p.value]));
      const grossQ: Pt[] = ((s.grossMargin as Pt[]) ?? [])
        .filter((p) => revQ.has(p.date))
        .map((p) => ({ ...p, value: (p.value / 100) * (revQ.get(p.date) as number) }));
      const rolling = (rows: Pt[]): Pt[] => rows
        .map((p, i) => (i < 3 || daysBetween(rows[i - 3].date, p.date) > 300 ? null : { ...p, value: rows.slice(i - 3, i + 1).reduce((a, x) => a + x.value, 0) }))
        .filter(Boolean) as Pt[];
      const pick = (g: Group | undefined) => (v === "ttm" ? g?.ttm ?? [] : g?.q ?? []);
      const lines: Record<string, Pt[]> = {
        gross: v === "ttm" ? rolling(grossQ) : grossQ,
        operating: pick(s.operatingIncome),
        net: pick(s.netIncome),
      };
      const labelFor = new Map<string, string>();
      const at: Record<string, Map<string, number>> = {};
      for (const [k, rows] of Object.entries(lines)) {
        at[k] = new Map();
        for (const p of rows) {
          const r = rev.get(p.date);
          if (r == null || r === 0) continue;
          at[k].set(p.date, (p.value / r) * 100);
          labelFor.set(p.date, p.label);
        }
      }
      // The union of dates: a filer with no gross profit line (banks,
      // utilities, payment networks) still gets its other margins drawn.
      return [...labelFor.keys()].sort().map((d) => ({
        date: d, label: labelFor.get(d) as string,
        gross: at.gross.get(d) ?? null, operating: at.operating.get(d) ?? null, net: at.net.get(d) ?? null,
      }));
    };

    const liabilities = new Map<string, number>(((s.currentLiabilities as Pt[]) ?? []).map((p) => [p.date, p.value]));
    const liquidity: Keyed[] = ((s.currentAssets as Pt[]) ?? [])
      .filter((p) => liabilities.has(p.date))
      .map((p) => ({ date: p.date, label: p.label, assets: p.value, liabilities: liabilities.get(p.date) as number }));

    const securities = new Map<string, number>(((s.shortTermInvestments as Pt[]) ?? []).map((p) => [p.date, p.value]));
    const debt = new Map<string, number>(((s.debt as Pt[]) ?? []).map((p) => [p.date, p.value]));
    const funds: Keyed[] = ((s.cash as Pt[]) ?? []).map((p) => {
      const sec = securities.get(p.date) ?? 0, owed = debt.get(p.date) ?? 0;
      return { date: p.date, label: p.label, cash: p.value, securities: sec, debt: owed, net: p.value + sec - owed };
    });

    return {
      revenue, ocf, operatingIncome, netIncome, eps, fcf, fcfPerShare,
      margins: { q: marginsFor("q"), ttm: marginsFor("ttm") },
      pe: enrich(s.pe), ps: enrich(s.ps), shares: enrich(s.shares), equity: enrich(s.equity),
      liquidity, funds,
    };
  }, [s]);

  const latest = m ? last(m.revenue.q) ?? last(m.netIncome.q) : undefined;
  const common = { ticker, company };

  // Measures this filer doesn't report (a bank has no capital spending line,
  // so no free cash flow). They are left out of the grid rather than drawn as
  // empty boxes, and named at the foot of the page.
  const missing: string[] = [];

  /** A flow measure (revenue, cash flow, earnings) as a card of columns. */
  const flowCard = (id: string | undefined, title: string, g: { q: Row[]; ttm: Row[] }, fmt: (v: number) => string, axisFmt: (v: number) => string, wide = false) => {
    const n = nOf(title);
    const rows = (view === "ttm" ? g.ttm : g.q).slice(-n);
    const end = last(rows);
    if (rows.length < 2) { missing.push(title); return null; }
    // The rate is read off trailing-year totals, so a seasonal quarter at
    // either end can't skew it.
    const rate = rateText(yearlyRate(g.ttm, n));
    return (
      <ChartCard id={id} title={title} wide={wide} {...common} control={rangeSwitch(title)} motionKey={motionKey(title)}
        figure={end ? fmt(end.value) : undefined}
        delta={end && <Delta frac={end.yoy} label="vs year ago" />}
        caption={end ? [view === "ttm" ? `12 months to ${end.label}` : end.label, rate].filter(Boolean).join(" · ") : undefined}>
        <BarsPlot rows={rows} fmt={fmt} axisFmt={axisFmt} height={wide ? 300 : 232} />
      </ChartCard>
    );
  };

  /** A valuation multiple against its own history. */
  const multipleCard = (id: string | undefined, title: string, all: Row[], basis: string) => {
    const n = nOf(title);
    const rows = all.slice(-n);
    const end = last(rows);
    const avg = rows.length ? mean(rows.map((r) => r.value)) : 0;
    const lo = Math.min(...rows.map((r) => r.value)), hi = Math.max(...rows.map((r) => r.value));
    if (rows.length < 2) { missing.push(title); return null; }
    return (
      <ChartCard id={id} title={title} {...common} control={rangeSwitch(title)} motionKey={motionKey(title)}
        figure={end ? times(end.value) : undefined}
        delta={end && avg > 0 && <Delta frac={(end.value - avg) / avg} tone="neutral" label="vs its average" />}
        caption={end ? `${basis}, at each quarter's close · between ${times(lo)} and ${times(hi)}` : undefined}
        legend={[
          { name: title, color: "var(--series-1)", shape: "line", value: end ? times(end.value) : undefined },
          { name: "Average", color: "var(--text-muted)", shape: "dash", value: times(avg) },
        ]}>
        <TrendPlot rows={rows} fmt={(v) => times(v)} axisFmt={(v) => `${Math.round(v)}×`} height={232} average={avg} fromZero />
      </ChartCard>
    );
  };

  const MARGIN_SERIES: SeriesDef[] = [
    { key: "gross", name: "Gross", color: "var(--series-1)" },
    { key: "operating", name: "Operating", color: "var(--series-2)" },
    { key: "net", name: "Net", color: "var(--series-3)" },
  ];

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Financial Charts"
        subtitle="A company's filings, drawn: growth, cash, margins, valuation, share count, segments and balance sheet.">
        <TickerInput value={urlTicker} onSubmit={setUrlTicker} loading={loading} action="Load" />
      </PageHeader>

      {error && <ErrorNote title={`${urlTicker} didn't load`} message={lookupErrorText(error)} onRetry={retry} />}

      {loading && !data && <LoadingCharts />}

      {data && s && m && (
        <div className={stale ? "is-stale" : undefined} aria-busy={stale}>
          {/* Who this is, and the two controls that scope every chart below. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "14px 24px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <CompanyLogo ticker={ticker} size={44} fallback />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 10px" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: "1.3rem", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{company}</span>
                  <span style={{ fontFamily: MONO, fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>{ticker}</span>
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
                  {[data.profile?.sector, data.profile?.industry].filter(Boolean).join(" · ")}
                  {latest && <>{data.profile?.sector ? " · " : ""}Filed through {latest.label}, quarter ended {endDate(latest.date)}</>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Segmented label="Period" value={view} onChange={(v) => setParam("view", v, "q")}
                options={[{ value: "q", label: "Quarterly" }, { value: "ttm", label: "Trailing 12 months" }]} />
              <Segmented label="Range for every chart" value={range} options={RANGES}
                onChange={(v) => { setOwn({}); setParam("range", v, "5y"); }} />
            </div>
          </div>

          <Headline m={m} quarters={n} />

          <div style={{ marginTop: 22 }}>
            <SectionNav items={SECTIONS} watch={`${ticker}${seg ? "s" : ""}`} />
          </div>

          <section className="chart-group" style={{ marginTop: 8 }}>
            <GroupHead id="growth" title="Growth">What the company sells, and what it keeps.</GroupHead>
            <div className="chart-grid">
              {flowCard("revenue", "Revenue", m.revenue, (v) => money(v), axisCompact, true)}
              {flowCard(undefined, "Operating income", m.operatingIncome, (v) => money(v), axisCompact)}
              {flowCard(undefined, "Net income", m.netIncome, (v) => money(v), axisCompact)}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="cash" title="Cash">Cash the business brought in, and what was left after it invested.</GroupHead>
            <div className="chart-grid">
              {flowCard(undefined, "Operating cash flow", m.ocf, (v) => money(v), axisCompact)}
              {flowCard("fcf", "Free cash flow", m.fcf, (v) => money(v), axisCompact)}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="per-share" title="Per share">The same results divided by the share count, on today&rsquo;s shares.</GroupHead>
            <div className="chart-grid">
              {flowCard("eps", "Earnings per share", m.eps, dollars, (v) => `$${axisCompact(v)}`)}
              {flowCard(undefined, "Free cash flow per share", m.fcfPerShare, dollars, (v) => `$${axisCompact(v)}`)}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="margins" title="Margins">How much of each dollar of sales survives each layer of cost.</GroupHead>
            {(() => {
              const rows = (view === "ttm" ? m.margins.ttm : m.margins.q).slice(-nOf("Margins"));
              const shown = MARGIN_SERIES.filter((d) => rows.some((r) => r[d.key] != null));
              const end = (key: string) => [...rows].reverse().find((r) => r[key] != null);
              const lead = shown[0];
              const leadEnd = lead && end(lead.key);
              const yearBack = leadEnd && rows.find((r) => Math.abs(daysBetween(r.date as string, leadEnd.date as string) - 365) <= 24);
              const move = leadEnd && yearBack && yearBack[lead.key] != null
                ? (leadEnd[lead.key] as number) - (yearBack[lead.key] as number) : null;
              const legend: LegendItem[] = shown.map((d) => ({
                name: d.name, color: d.color, shape: "line", value: end(d.key) ? pct(end(d.key)![d.key] as number) : undefined,
              }));
              return (
                <div className="chart-grid">
                  <ChartCard title={marginTitle(shown.map((d) => d.name))} wide {...common} shot={rows.length >= 2} control={rangeSwitch("Margins")} motionKey={motionKey("Margins")}
                    figure={leadEnd ? pct(leadEnd[lead.key] as number) : undefined}
                    delta={move != null && <Delta frac={move} text={`${Math.abs(move).toFixed(1)} pts`} label="vs year ago" />}
                    caption={leadEnd ? `${lead.name} margin, ${view === "ttm" ? `12 months to ${leadEnd.label}` : leadEnd.label}` : undefined}
                    legend={legend}
                    note={!rows.some((r) => r.gross != null) && rows.length
                      ? "This filer doesn't report gross profit, which is common for banks, utilities and payment networks, so there is no gross margin to draw."
                      : undefined}>
                    {rows.length >= 2
                      ? <LinesPlot rows={rows} series={shown} fmt={(v) => pct(v)} axisFmt={(v) => `${Math.round(v)}%`} height={280} />
                      : <NoSeries />}
                  </ChartCard>
                </div>
              );
            })()}
          </section>

          <section className="chart-group">
            <GroupHead id="valuation" title="Valuation">What the market paid for a dollar of earnings and of sales.</GroupHead>
            <div className="chart-grid">
              {multipleCard(undefined, "Price to earnings", m.pe, "Price over trailing earnings per share")}
              {multipleCard(undefined, "Price to sales", m.ps, "Market value over trailing revenue")}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="capital" title="Capital">How many shares the results are split between, and the book value behind them.</GroupHead>
            <div className="chart-grid">
              {(() => {
                const rows = m.shares.slice(-nOf("Shares outstanding"));
                const end = last(rows), start = rows[0];
                const drift = end && start && start.value > 0 ? (end.value - start.value) / start.value : null;
                return (
                  <ChartCard title="Shares outstanding" {...common} shot={rows.length >= 2} control={rangeSwitch("Shares outstanding")} motionKey={motionKey("Shares outstanding")}
                    figure={end ? count(end.value) : undefined}
                    delta={end && <Delta frac={end.yoy} tone="neutral" label="vs year ago" />}
                    caption={end && drift != null ? `${end.label} · ${signedPct(drift)} since ${start.label}, adjusted for splits` : undefined}>
                    {rows.length >= 2
                      ? <TrendPlot rows={rows} fmt={(v) => count(v)} axisFmt={(v) => count(v, 1)} height={232} />
                      : <NoSeries />}
                  </ChartCard>
                );
              })()}
              {(() => {
                const rows = m.equity.slice(-nOf("Shareholders' equity"));
                const end = last(rows);
                return (
                  <ChartCard title="Shareholders' equity" {...common} shot={rows.length >= 2} control={rangeSwitch("Shareholders' equity")} motionKey={motionKey("Shareholders' equity")}
                    figure={end ? money(end.value) : undefined}
                    delta={end && <Delta frac={end.yoy} label="vs year ago" />}
                    caption={end ? `${end.label} · assets less liabilities` : undefined}>
                    {rows.length >= 2
                      ? <BarsPlot rows={rows} fmt={(v) => money(v)} axisFmt={axisCompact} height={232} />
                      : <NoSeries />}
                  </ChartCard>
                );
              })()}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="segments" title="Segments">Where the revenue comes from, as the latest annual report breaks it down.</GroupHead>
            <div className="chart-grid">
              <SegmentCard title="Revenue by product" what="product-level" state={seg ? "ready" : "loading"}
                breakdown={seg?.product} reason={seg?.product ? undefined : seg?.reason} {...common} />
              <SegmentCard title="Revenue by geography" what="geographic" state={seg ? "ready" : "loading"}
                breakdown={seg?.geography} reason={seg?.geography ? undefined : seg?.reason} {...common} />
              {seg?.segment && (
                <SegmentCard title="Revenue by reportable segment" what="segment" state="ready"
                  breakdown={seg.segment} {...common} />
              )}
            </div>
          </section>

          <section className="chart-group">
            <GroupHead id="balance" title="Balance sheet">What it holds against what it owes.</GroupHead>
            <div className="chart-grid">
              {(() => {
                const rows = m.liquidity.slice(-nOf("Current assets and current liabilities"));
                const end = last(rows);
                const ratio = end && (end.liabilities as number) > 0 ? (end.assets as number) / (end.liabilities as number) : null;
                return (
                  <ChartCard title="Current assets and current liabilities" {...common} shot={rows.length >= 2} control={rangeSwitch("Current assets and current liabilities")} motionKey={motionKey("Current assets and current liabilities")}
                    figure={ratio != null ? times(ratio, 2) : undefined}
                    delta={ratio != null && <span style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-secondary)" }}>current ratio</span>}
                    caption={end ? `${end.label} · ${money(end.assets as number, 1)} of current assets against ${money(end.liabilities as number, 1)} of current liabilities` : undefined}
                    legend={[
                      { name: "Current assets", color: "var(--series-1)" },
                      { name: "Current liabilities", color: "var(--series-2)" },
                    ]}>
                    {rows.length >= 2
                      ? <ColumnsPlot rows={rows} fmt={(v) => money(v)} axisFmt={axisCompact} height={232}
                          series={[
                            { key: "assets", name: "Current assets", color: "var(--series-1)" },
                            { key: "liabilities", name: "Current liabilities", color: "var(--series-2)" },
                          ]}
                          footer={(r) => ((r.liabilities as number) > 0 ? [{ name: "Current ratio", value: times((r.assets as number) / (r.liabilities as number), 2) }] : [])} />
                      : <NoSeries />}
                  </ChartCard>
                );
              })()}
              {(() => {
                const rows = m.funds.slice(-nOf("Cash, securities and debt"));
                const end = last(rows);
                const net = end ? (end.net as number) : null;
                return (
                  <ChartCard id="net-cash" title="Cash, securities and debt" {...common} shot={rows.length >= 2} control={rangeSwitch("Cash, securities and debt")} motionKey={motionKey("Cash, securities and debt")}
                    figure={net != null ? money(Math.abs(net)) : undefined}
                    delta={net != null && <span style={{ fontFamily: SANS, fontSize: "0.8rem", color: "var(--text-secondary)" }}>{net >= 0 ? "net cash" : "net debt"}</span>}
                    caption={end ? `${end.label} · ${money((end.cash as number) + (end.securities as number), 1)} on hand, ${money(end.debt as number, 1)} of long-term debt` : undefined}
                    legend={[
                      { name: "Cash", color: "var(--series-1)" },
                      { name: "Marketable securities", color: "var(--series-3)" },
                      { name: "Long-term debt", color: "var(--series-2)" },
                    ]}>
                    {rows.length >= 2
                      ? <ColumnsPlot rows={rows} fmt={(v) => money(v)} axisFmt={axisCompact} height={232}
                          series={[
                            { key: "cash", name: "Cash", color: "var(--series-1)", stack: "held" },
                            { key: "securities", name: "Marketable securities", color: "var(--series-3)", stack: "held" },
                            { key: "debt", name: "Long-term debt", color: "var(--series-2)" },
                          ]}
                          footer={(r) => [{ name: (r.net as number) >= 0 ? "Net cash" : "Net debt", value: money(Math.abs(r.net as number)) }]} />
                      : <NoSeries />}
                  </ChartCard>
                );
              })()}
            </div>
          </section>

          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2rem", lineHeight: 1.65, maxWidth: "80ch" }}>
            Figures are from the company&rsquo;s 10-K and 10-Q filings with the SEC. A fourth quarter is the full year less the
            first three. Share counts and per-share figures are adjusted for stock splits; where a filer doesn&rsquo;t report
            quarterly earnings per share, it is net income divided by shares outstanding. Valuation multiples use the closing
            price at each quarter end. The same numbers as tables are on{" "}
            <Link href={`/financials?ticker=${encodeURIComponent(ticker)}`} style={{ color: "var(--accent-gold)" }}>Financials</Link>.
            {missing.length > 0 && (
              <> Not in this company&rsquo;s filings, so not drawn: {missing.map((t) => t.toLowerCase()).join(", ")}.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** The trailing-year figures a reader wants before any chart: one ruled strip, each cell a jump link. */
function Headline({ m, quarters }: { m: Derived; quarters: number }) {
  const rev = last(m.revenue.ttm), eps = last(m.eps.ttm), pe = last(m.pe), funds = last(m.funds);
  const cashFlow = m.fcf.ttm.length ? { rows: m.fcf.ttm, label: "Free cash flow", href: "#fcf" } : { rows: m.ocf.ttm, label: "Operating cash flow", href: "#cash" };
  const cf = last(cashFlow.rows);
  const opm = m.margins.ttm.filter((r) => r.operating != null);
  const opEnd = last(opm);
  const opYear = opEnd && opm.find((r) => Math.abs(daysBetween(r.date, opEnd.date) - 365) <= 24);
  const opMove = opEnd && opYear ? (opEnd.operating as number) - (opYear.operating as number) : null;
  const peAvg = m.pe.length ? mean(m.pe.slice(-quarters).map((r) => r.value)) : 0;
  const spark = (rows: { value: number }[]) => rows.slice(-12).map((r) => r.value);

  const cells: React.ReactNode[] = [];
  if (rev) cells.push(<StatCell key="rev" label="Revenue" value={money(rev.value)} href="#revenue" spark={spark(m.revenue.ttm)}
    delta={<Delta frac={rev.yoy} label="vs year ago" size="0.75rem" />} />);
  if (opEnd) cells.push(<StatCell key="opm" label="Operating margin" value={pct(opEnd.operating as number)} href="#margins"
    spark={opm.slice(-12).map((r) => r.operating as number)}
    delta={opMove != null ? <Delta frac={opMove} text={`${Math.abs(opMove).toFixed(1)} pts`} label="vs year ago" size="0.75rem" /> : undefined} />);
  if (eps) cells.push(<StatCell key="eps" label="Earnings per share" value={dollars(eps.value)} href="#eps" spark={spark(m.eps.ttm)}
    delta={<Delta frac={eps.yoy} label="vs year ago" size="0.75rem" />} />);
  if (cf) cells.push(<StatCell key="cf" label={cashFlow.label} value={money(cf.value)} href={cashFlow.href} spark={spark(cashFlow.rows)}
    delta={<Delta frac={cf.yoy} label="vs year ago" size="0.75rem" />} />);
  if (pe) cells.push(<StatCell key="pe" label="Price to earnings" value={times(pe.value)} href="#valuation" spark={spark(m.pe)}
    delta={peAvg > 0 ? <Delta frac={(pe.value - peAvg) / peAvg} tone="neutral" label="vs its average" size="0.75rem" /> : undefined} />);
  if (funds) cells.push(<StatCell key="net" label={(funds.net as number) >= 0 ? "Net cash" : "Net debt"} value={money(Math.abs(funds.net as number))} href="#net-cash"
    spark={m.funds.slice(-12).map((r) => r.net as number)} sub={`${funds.label}, long-term debt`} />);
  if (cells.length < 2) return null;

  return (
    <div>
      <div className="stat-strip">
        <div className="stat-grid" style={cells.length < 6 ? { gridTemplateColumns: `repeat(auto-fit, minmax(${cells.length <= 3 ? 200 : 160}px, 1fr))` } : undefined}>
          {cells}
        </div>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "8px 4px 0" }}>
        Trailing 12 months{rev ? ` to ${rev.label}` : ""}. Multiples and net cash are as of the latest quarter end.
      </p>
    </div>
  );
}
export default function ChartsPage() {
  return <Suspense fallback={null}><ChartsInner /></Suspense>;
}
