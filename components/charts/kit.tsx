"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import ChartShotButton from "@/components/ChartShotButton";

// The pieces every chart on the site is assembled from: number formats, axis
// settings, the hover readout, the card a chart sits in, and the small figures
// (delta, sparkline, legend) that go around it. Kept in one place so a chart on
// the dividends page reads exactly like one on the charts page.

export const SANS = "'Public Sans', sans-serif";
export const DISPLAY = "'Space Grotesk', Georgia, serif";
export const MONO = "'Spline Sans Mono', monospace";

export const SERIES = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

// ── Numbers ──────────────────────────────────────────────────────────────────

const trim = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);

/** $96.22B, $412.5M, $3.40. For a figure read on its own. */
export function money(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "n/a";
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(digits)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1)}K`;
  return `${sign}$${a.toFixed(2)}`;
}

/** 24.10B, 310M. A count rather than an amount. */
export function count(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "n/a";
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(1)}K`;
  return `${sign}${a.toFixed(0)}`;
}

/** Axis ticks: as short as the value allows (100B, 2.5B, 500M, 0). */
export function axisCompact(v: number): string {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a === 0) return "0";
  if (a >= 1e12) return `${sign}${trim((a / 1e12).toFixed(2))}T`;
  if (a >= 1e9) return `${sign}${trim((a / 1e9).toFixed(a >= 1e10 ? 0 : 1))}B`;
  if (a >= 1e6) return `${sign}${trim((a / 1e6).toFixed(a >= 1e7 ? 0 : 1))}M`;
  if (a >= 1e3) return `${sign}${trim((a / 1e3).toFixed(a >= 1e4 ? 0 : 1))}K`;
  return `${sign}${trim(a.toFixed(2))}`;
}

export const dollars = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
export const pct = (v: number, digits = 1) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}%`;
export const times = (v: number, digits = 1) => `${v.toFixed(digits)}×`;
/** A change as a signed percentage, from a fraction (0.123 → +12.3%). */
export function signedPct(frac: number, digits = 1): string {
  const p = frac * 100;
  // Past a few hundred percent the decimals are noise.
  const d = Math.abs(p) >= 1000 ? 0 : digits;
  return `${p >= 0 ? "+" : "−"}${Math.abs(p).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
}

// ── Axes ─────────────────────────────────────────────────────────────────────

const TICK = { fill: "var(--tick)", fontSize: 11, fontFamily: MONO };

/** Spread onto <XAxis>. Ticks thin themselves out; the latest period is always labelled. */
export const xAxis = {
  tick: TICK, axisLine: false, tickLine: false, tickMargin: 8, height: 30,
  minTickGap: 26, interval: "preserveEnd" as const,
};
/** Spread onto <YAxis>. A few round ticks, no rule. */
export const yAxis = {
  tick: TICK, axisLine: false, tickLine: false, tickMargin: 6, width: 46, tickCount: 5,
};
/** Spread onto <CartesianGrid>: solid horizontal hairlines only. */
export const grid = { vertical: false, stroke: "var(--border)" };
export const barCursor = { fill: "var(--cursor-fill)" };
export const lineCursor = { stroke: "var(--border-active)", strokeWidth: 1 };
/** The dot under the pointer on a line: series colour, ringed in the card surface. */
export const activeDot = { r: 4, strokeWidth: 2, stroke: "var(--surface-solid)" };

// ── Hover readout ────────────────────────────────────────────────────────────

export type TipSpec = {
  title: string;
  sub?: string;
  /** One row per series at this position. The value leads; the name follows. */
  rows: { color?: string; name?: string; value: string }[];
  /** Comparisons under the rule: "vs year ago  +12.3%". */
  notes?: { name: string; value: string; tone?: "up" | "down" | "flat" }[];
};

/** Pass as <Tooltip content={<ChartTip build={...} />} />. */
export function ChartTip({ active, payload, label, build }: {
  active?: boolean;
  payload?: any[];
  label?: any;
  build: (row: any, payload: any[], label?: any) => TipSpec | null;
}) {
  if (!active || !payload?.length) return null;
  const spec = build(payload[0].payload, payload, label);
  if (!spec) return null;
  const single = spec.rows.length === 1 && !spec.rows[0].name;
  return (
    <div style={{
      background: "var(--tooltip-bg)", border: "1px solid var(--border-active)", borderRadius: 12,
      padding: "9px 12px 10px", minWidth: 148, maxWidth: 260, fontFamily: SANS, pointerEvents: "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
        <span style={{ fontFamily: MONO, fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)" }}>{spec.title}</span>
        {spec.sub && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{spec.sub}</span>}
      </div>
      {single ? (
        <div style={{ fontFamily: MONO, fontSize: "1.05rem", fontWeight: 600, color: "var(--text-primary)", marginTop: 3 }}>
          {spec.rows[0].value}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 4, marginTop: 7 }}>
          {spec.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {r.color && <span aria-hidden style={{ width: 10, height: 2, borderRadius: 1, background: r.color, flexShrink: 0 }} />}
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", flex: 1, minWidth: 0 }}>{r.name}</span>
              <span style={{ fontFamily: MONO, fontSize: "0.78rem", fontWeight: 600, color: "var(--text-primary)" }}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {!!spec.notes?.length && (
        <div style={{ display: "grid", gap: 3, marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--border)" }}>
          {spec.notes.map((n, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{n.name}</span>
              <span style={{
                fontFamily: MONO, fontSize: "0.72rem", fontWeight: 600,
                color: n.tone === "up" ? "var(--positive)" : n.tone === "down" ? "var(--negative)" : "var(--text-secondary)",
              }}>{n.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A readout made from whichever series the chart has at the pointer, for charts
 * that don't need anything computed: give it the title and the number format.
 */
export function seriesTip(o: {
  title: (label: any, row: any) => string;
  value: (v: number, key: string) => string;
  name?: (key: string) => string;
  sub?: string;
  /** One series: print the value alone, large, without its name. */
  single?: boolean;
}) {
  return (row: any, payload: any[], label?: any): TipSpec => ({
    title: o.title(label, row), sub: o.sub,
    rows: payload
      .filter((e) => e.value != null && isFinite(Number(e.value)))
      .slice(0, o.single ? 1 : undefined)
      .map((e) => (o.single
        ? { value: o.value(Number(e.value), String(e.dataKey)) }
        : {
            color: e.color ?? e.stroke,
            name: o.name ? o.name(String(e.dataKey)) : String(e.name ?? e.dataKey),
            value: o.value(Number(e.value), String(e.dataKey)),
          })),
  });
}

/**
 * The same readout for a chart that already describes itself with recharts'
 * own `formatter` and `labelFormatter` props: pass this as `content` and those
 * two keep working, drawn in the shared style.
 */
export function FormattedTip({ active, payload, label, formatter, labelFormatter }: {
  active?: boolean;
  payload?: any[];
  label?: any;
  formatter?: (...args: any[]) => any;
  labelFormatter?: (...args: any[]) => any;
}) {
  return (
    <ChartTip active={active} payload={payload} label={label} build={(_row, entries, l) => {
      const rows = entries
        .filter((e) => e.value != null)
        .map((e, i) => {
          const out = formatter ? formatter(e.value, e.name, e, i, entries) : e.value;
          const [value, name] = Array.isArray(out) ? out : [out, e.name];
          return { color: e.color ?? e.stroke, name: String(name ?? ""), value: String(value) };
        });
      const title = String(labelFormatter ? labelFormatter(l, entries) : l ?? "");
      // A single series prints its value alone, with its name beside the title.
      return rows.length === 1
        ? { title, sub: rows[0].name, rows: [{ value: rows[0].value }] }
        : { title, rows };
    }} />
  );
}

/** A tooltip note for a change given as a fraction, or nothing when there is no base to compare with. */
export function changeNote(name: string, frac: number | null | undefined): NonNullable<TipSpec["notes"]> {
  if (frac == null || !isFinite(frac)) return [];
  return [{ name, value: signedPct(frac), tone: frac > 0 ? "up" : frac < 0 ? "down" : "flat" }];
}

// ── Small figures ────────────────────────────────────────────────────────────

/**
 * A change, with its direction drawn as well as coloured.
 * `tone="neutral"` is for measures where up is not simply good (share count,
 * a valuation multiple): the arrow stays, the green and red go.
 */
export function Delta({ frac, text, label, tone = "auto", size = "0.8rem" }: {
  /** The change as a fraction; sets direction and, unless `text` is given, the wording. */
  frac: number | null | undefined;
  /** Override the printed figure (percentage points, say). */
  text?: string;
  label?: string;
  tone?: "auto" | "neutral";
  size?: string;
}) {
  if (frac == null || !isFinite(frac)) return null;
  const up = frac > 0, flat = frac === 0;
  const color = tone === "neutral" || flat ? "var(--text-secondary)" : up ? "var(--positive)" : "var(--negative)";
  const shown = text ?? signedPct(frac).replace(/^[+−]/, "");
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color, fontFamily: MONO, fontSize: size, fontWeight: 600 }}>
        {!flat && <Icon name={up ? "tri-up" : "tri-down"} size="0.72em" filled strokeWidth={1.5} style={{ verticalAlign: 0 }} />}
        <span className="sr-only">{flat ? "unchanged" : up ? "up" : "down"} </span>
        {shown}
      </span>
      {label && <span style={{ fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)" }}>{label}</span>}
    </span>
  );
}

/** The shape of a series in a line of space. Decoration beside a figure, so it is hidden from readers. */
export function Sparkline({ values, height = 26 }: { values: number[]; height?: number }) {
  const v = values.filter((x) => isFinite(x));
  if (v.length < 3) return <div style={{ height }} />;
  const min = Math.min(...v), max = Math.max(...v);
  const span = max - min || 1;
  const y = (x: number) => 3 + (1 - (x - min) / span) * (height - 6);
  const d = v.map((x, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 100).toFixed(2)} ${y(x).toFixed(2)}`).join(" ");
  return (
    <div aria-hidden style={{ position: "relative", height, marginRight: 4 }}>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <path d={d} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" opacity={0.75} />
      </svg>
      <span style={{
        position: "absolute", right: -4, top: y(v[v.length - 1]) - 4, width: 8, height: 8, borderRadius: 999,
        background: "var(--accent-gold)", boxShadow: "0 0 0 2px var(--surface-solid)",
      }} />
    </div>
  );
}

export type LegendItem = { name: string; color: string; value?: string; shape?: "line" | "box" | "dash" };

/** Always shown for two or more series; carries each one's latest value so the line ends need no labels. */
export function LegendRow({ items }: { items: LegendItem[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", margin: "2px 0 10px" }}>
      {items.map((it) => (
        <span key={it.name} data-legend-item={it.name} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: SANS, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          {it.shape === "dash" ? (
            <span aria-hidden style={{ width: 14, height: 0, borderTop: `2px dashed ${it.color}`, flexShrink: 0 }} />
          ) : (
            <span data-legend-key aria-hidden style={{
              width: it.shape === "line" ? 14 : 10, height: it.shape === "line" ? 2 : 10,
              borderRadius: it.shape === "line" ? 1 : 3, background: it.color, flexShrink: 0,
            }} />
          )}
          {it.name}
          {it.value && <span style={{ fontFamily: MONO, fontWeight: 600, color: "var(--text-primary)" }}>{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** A choice between a few views. Arrow keys move the choice, as in any radio group. */
export function Segmented<T extends string>({ label, value, options, onChange, size }: {
  label: string;
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
  /** "sm" sits in a card header beside the camera button. */
  size?: "sm";
}) {
  const onKey = (e: React.KeyboardEvent) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    onChange(next.value);
    const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button");
    btns[(i + dir + options.length) % options.length]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={size === "sm" ? "seg seg-sm" : "seg"} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={o.title}
          tabIndex={o.value === value || (i === 0 && !options.some((x) => x.value === value)) ? 0 : -1}
          className="seg-btn" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Time frames ──────────────────────────────────────────────────────────────

const FRAMES = [
  { key: "1W", days: 7, title: "1 week" },
  { key: "1M", days: 31, title: "1 month" },
  { key: "3M", days: 92, title: "3 months" },
  { key: "6M", days: 183, title: "6 months" },
  { key: "1Y", days: 366, title: "1 year" },
  { key: "3Y", days: 1096, title: "3 years" },
  { key: "5Y", days: 1827, title: "5 years" },
  { key: "10Y", days: 3653, title: "10 years" },
  { key: "20Y", days: 7305, title: "20 years" },
] as const;
export type FrameKey = (typeof FRAMES)[number]["key"] | "All";

const toMs = (d: string | number | Date) =>
  d instanceof Date ? d.getTime() : typeof d === "number" ? d : Date.parse(d.length <= 10 ? `${d}T00:00:00Z` : d);

/**
 * A time-frame switch for one chart, and the rows inside the chosen frame.
 *
 * Only frames the data can fill are offered (a series three months long gets
 * "1M" and "All", not a "5Y" button that would change nothing), at most four
 * of them plus "All", which is where every chart starts.
 */
export function useTimeframe<T>(rows: T[], dateOf: (r: T) => string | number | Date, opts?: {
  label?: string;
  /** Restrict the choice to these frames (still dropped when the data is shorter). */
  frames?: FrameKey[];
  initial?: FrameKey;
}): { rows: T[]; control: React.ReactNode; frame: FrameKey } {
  const [picked, setPicked] = useState<FrameKey>(opts?.initial ?? "All");
  const allow = opts?.frames;
  const { offered, last } = useMemo(() => {
    if (rows.length < 2) return { offered: [] as (typeof FRAMES)[number][], last: 0 };
    const a = toMs(dateOf(rows[0])), b = toMs(dateOf(rows[rows.length - 1]));
    const span = (b - a) / 864e5;
    let fit = FRAMES.filter((f) => f.days < span * 0.97 && (!allow || allow.includes(f.key)));
    // The longest few: the short ones matter least on a long history.
    if (fit.length > 4) fit = fit.slice(-4);
    return { offered: fit, last: b };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, allow?.join(",")]);
  // A frame that this data no longer offers (the company changed) falls back to All.
  const frame: FrameKey = picked !== "All" && offered.some((f) => f.key === picked) ? picked : "All";
  const cut = useMemo(() => {
    const f = FRAMES.find((x) => x.key === frame);
    if (!f) return rows;
    const from = last - f.days * 864e5;
    const out = rows.filter((r) => toMs(dateOf(r)) >= from);
    return out.length >= 2 ? out : rows.slice(-2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, frame, last]);
  const control = offered.length ? (
    <Segmented size="sm" label={opts?.label ?? "Time frame"} value={frame} onChange={setPicked}
      options={[...offered.map((f) => ({ value: f.key as FrameKey, label: f.key, title: f.title })), { value: "All" as FrameKey, label: "All", title: "All available" }]} />
  ) : null;
  return { rows: cut, control, frame };
}

// ── The card ─────────────────────────────────────────────────────────────────

/** Marks a card the first time it scrolls into view, then clears the mark. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const obs = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      el.dataset.in = "1";
      timer = setTimeout(() => { el.dataset.in = "done"; }, 700);
    }, { rootMargin: "0px 0px -8% 0px" });
    obs.observe(el);
    return () => { obs.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return ref;
}

/**
 * A chart, led by its figure: title, the latest value, how it has changed,
 * then the plot. The camera button copies or saves the chart as an image.
 */
export function ChartCard({
  id, title, figure, delta, caption, legend, note, wide, ticker, company, shot = true, control, children,
}: {
  id?: string;
  title: string;
  /** The headline value, already formatted. */
  figure?: React.ReactNode;
  delta?: React.ReactNode;
  /** One muted line under the figure: the period, the long-run rate. */
  caption?: React.ReactNode;
  legend?: LegendItem[];
  /** A caveat under the plot. */
  note?: React.ReactNode;
  /** Take the full row. */
  wide?: boolean;
  ticker?: string;
  company?: string;
  shot?: boolean;
  /** This chart's own switch (its time frame), shown beside the camera. */
  control?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id={id} data-chart-card className={`chart-card${wide ? " chart-card-wide" : ""}`}>
      <header data-chart-section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px 12px", marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <h3 data-section-title style={{
            fontFamily: SANS, fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)",
            margin: 0, letterSpacing: "0.005em",
          }}>{title}</h3>
          {figure != null && (
            <div data-shot-figure style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "2px 12px", marginTop: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: wide ? "1.75rem" : "1.5rem", fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1, color: "var(--text-primary)" }}>
                {figure}
              </span>
              {delta}
            </div>
          )}
          {caption && (
            <div style={{ fontFamily: SANS, fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 5, lineHeight: 1.45 }}>{caption}</div>
          )}
        </div>
        {(control || (shot && ticker)) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            {control}
            {shot && ticker && <ChartShotButton ticker={ticker} companyName={company} />}
          </div>
        )}
      </header>
      {legend && legend.length > 1 && <LegendRow items={legend} />}
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
      {note && (
        <p style={{ fontFamily: SANS, fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.55, margin: "4px 2px 8px", maxWidth: "70ch" }}>{note}</p>
      )}
    </section>
  );
}

/** One cell of the headline strip. A link when it has somewhere to jump to. */
export function StatCell({ label, value, delta, sub, foot, spark, href, valueTone, subTone }: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  sub?: string;
  /** A last small line: the date a figure is for. */
  foot?: string;
  spark?: number[];
  href?: string;
  /** Green or red on the figure itself: only for a figure that is a gain or a loss. */
  valueTone?: "up" | "down";
  /** Green or red on the line beneath, where it states a direction or a warning. */
  subTone?: "up" | "down";
}) {
  const toneColor = (t: "up" | "down" | undefined, fallback: string) =>
    t === "up" ? "var(--positive)" : t === "down" ? "var(--negative)" : fallback;
  const body = (
    <>
      <div style={{ fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.02em", color: toneColor(valueTone, "var(--text-primary)"), marginTop: 8, lineHeight: 1.15, overflowWrap: "anywhere" }}>{value}</div>
      <div style={{ minHeight: "1.2rem", marginTop: 4 }}>
        {delta ?? (sub && <span style={{ fontFamily: SANS, fontSize: "0.72rem", lineHeight: 1.4, color: toneColor(subTone, "var(--text-muted)") }}>{sub}</span>)}
      </div>
      {foot && <div style={{ fontFamily: MONO, fontSize: "0.6875rem", color: "var(--text-muted)", marginTop: 4 }}>{foot}</div>}
      {spark && <div style={{ marginTop: 8 }}><Sparkline values={spark} /></div>}
    </>
  );
  return href
    ? <a href={href} className="stat-cell">{body}</a>
    : <div className="stat-cell">{body}</div>;
}

/**
 * A row of headline figures as one ruled strip. `min` is the narrowest a cell
 * may get before the row wraps; two cells always fit across a phone.
 */
export function StatStrip({ children, min = 170, style }: { children: React.ReactNode; min?: number; style?: React.CSSProperties }) {
  return (
    <div className="stat-strip" style={style}>
      <div className="stat-grid" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}px, 44vw), 1fr))` }}>
        {children}
      </div>
    </div>
  );
}
