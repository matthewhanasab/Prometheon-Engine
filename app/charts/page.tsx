"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  Legend,
  ReferenceLine,
} from "recharts";
import ChartShotButton from "@/components/ChartShotButton";
import CompanyLogo from "@/components/CompanyLogo";

const SEGMENT_COLORS = [
  "var(--accent-gold)","#3B82F6","#22C55E","#EF4444","#A78BFA","#F97316",
  "#06B6D4","#EC4899","#84CC16","#F59E0B","#6366F1","#14B8A6",
];

// ─── helpers ────────────────────────────────────────────────────────────────

function qLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} '${String(d.getFullYear()).slice(2)}`;
}

// Prefer FMP's reported fiscal period/year — deriving the quarter from the
// period-end date mislabels companies whose quarter ends spill a day into the
// next calendar quarter (e.g. AMD's Q1 ends April 1), and can even collide.
function periodLabel(r: { period?: string; fiscalYear?: string | number; date: string }): string {
  if (r.period && /^Q[1-4]$/.test(r.period) && r.fiscalYear != null) {
    return `${r.period} '${String(r.fiscalYear).slice(2)}`;
  }
  return qLabel(r.date);
}

function fmtVal(v: number | null): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(2)}`;
}

function fmtShares(v: number | null): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toFixed(0);
}

// 1-2-5 per-decade ticks across [lo, hi] for a log axis
function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  let dec = Math.floor(Math.log10(lo));
  while (Math.pow(10, dec) <= hi + 1e-9) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, dec);
      if (v >= lo - 1e-9 && v <= hi + 1e-9) out.push(v);
    }
    dec++;
  }
  return out;
}

function rollingTTM(arr: (number | null)[]): (number | null)[] {
  // arr is chronological (oldest first). TTM[i] = sum of [i-3..i]; any missing
  // quarter in the window makes the whole sum null rather than undercounting.
  return arr.map((_, i) => {
    if (i < 3) return null;
    const w = [arr[i], arr[i - 1], arr[i - 2], arr[i - 3]];
    if (w.some((v) => v == null || !isFinite(v as number))) return null;
    return (w as number[]).reduce((a, b) => a + b, 0);
  });
}

// TTM series extended through forecast quarters. Each future quarter's TTM is the
// trailing four quarters ending there — a blend of reported and estimated quarters.
function forecastTTM(actualQ: (number | null)[], estQ: (number | null)[]): (number | null)[] {
  const combined = [...actualQ, ...estQ];
  const ttm = rollingTTM(combined);
  return ttm.slice(actualQ.length); // just the estimate-quarter TTM values
}

// ─── shared chart style ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  cursor: { fill: "var(--cursor-fill)" },
  labelStyle: { color: "var(--text-primary)" },
  itemStyle: { color: "var(--text-primary)" },
  contentStyle: {
    background: "var(--tooltip-bg)",
    border: "1px solid var(--tooltip-border)",
    borderRadius: 22,
    fontFamily: "Spline Sans Mono, monospace",
    fontSize: 15,
    color: "var(--text-primary)",
  },
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 22,
  padding: "12px 8px 4px",
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Space Grotesk', Georgia, serif",
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: "0.5rem",
  marginTop: "1.5rem",
  letterSpacing: "0.01em",
};

const X_TICK = { fill: "var(--tick)", fontSize: 16 };
const Y_TICK = { fill: "var(--tick)", fontSize: 16 };

// ─── TTM toggle ──────────────────────────────────────────────────────────────

function TtmToggle({ isTtm, onChange }: { isTtm: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
      {(["Quarterly", "TTM"] as const).map((opt) => {
        const active = isTtm === (opt === "TTM");
        return (
          <button
            key={opt}
            onClick={() => onChange(opt === "TTM")}
            style={{
              background: active ? "var(--accent-gold)" : "var(--bg-elevated)",
              color: active ? "var(--on-accent)" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              padding: "3px 10px",
              fontSize: "0.68rem",
              fontFamily: "'Public Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ─── QoQ annotation label ────────────────────────────────────────────────────

function QoQLabel(props: {
  x?: number; y?: number; width?: number; value?: number; index?: number; values: number[];
}) {
  const { x = 0, y = 0, width = 0, value, index = 0, values } = props;
  if (index === 0 || value == null || !isFinite(value)) return null;
  const prev = values[index - 1];
  if (prev == null || prev === 0) return null;
  const pct = ((value - prev) / Math.abs(prev)) * 100;
  const color = pct >= 0 ? "#22C55E" : "#EF4444";
  const label = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      fill={color}
      fontSize={13}
      textAnchor="middle"
      fontFamily="Spline Sans Mono, monospace"
    >
      {label}
    </text>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface IncomeRow {
  date: string;
  period?: string;
  fiscalYear?: string | number;
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  epsDiluted?: number;
  eps?: number;
  weightedAverageShsOutDil?: number;
  weightedAverageShsOut?: number;
}

interface CashflowRow {
  date: string;
  period?: string;
  fiscalYear?: string | number;
  operatingCashFlow: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
}

interface BalanceRow {
  date: string;
  period?: string;
  fiscalYear?: string | number;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
  cashAndCashEquivalents?: number;
  shortTermInvestments?: number;
  totalDebt?: number;
  totalStockholdersEquity?: number;
  totalEquity?: number;
}

interface Profile {
  companyName?: string;
  sector?: string;
  industry?: string;
}

interface EstimateRow {
  date: string;
  revenueAvg?: number;
  epsAvg?: number;
}

interface ChartsData {
  income: IncomeRow[];
  cashflow: CashflowRow[];
  balance: BalanceRow[];
  profile: Profile;
  productSegments: Record<string, number>[];
  geoSegments: Record<string, number>[];
  estimates: EstimateRow[];
  prices: { date: string; price: number }[];
}

// ─── empty preview ───────────────────────────────────────────────────────────

function ChartsEmpty() {
  const SECTIONS = [
    ["Revenue", "Quarterly bars with QoQ % change and analyst forecast quarters"],
    ["Operating Cash Flow", "Cash generated by the core business, quarter by quarter"],
    ["Operating Income", "Profitability from operations — green up, red down"],
    ["Gross & Net Margin", "Margin trends over the last five years"],
    ["Earnings Per Share", "Diluted EPS with forward estimates"],
    ["Free Cash Flow", "What's left after capital expenditures"],
    ["Free Cash Flow Per Share", "Cash generation on a per-share basis"],
    ["Historical PE Ratio", "What the market has paid for a dollar of earnings, quarter by quarter"],
    ["Historical Price / Sales", "Market cap against trailing revenue, with the historical median"],
    ["Shares Outstanding", "Dilution or buybacks at a glance"],
    ["Shareholders' Equity", "Book value — what's left for owners after debts"],
    ["Revenue by Product & Geography", "Where the money actually comes from"],
    ["Cash · Securities · Debt", "Liquidity stack vs. total debt each quarter"],
  ];
  return (
    <div>
      {SECTIONS.map(([title, desc]) => (
        <div key={title}>
          <div style={SECTION_LABEL_STYLE}>{title}</div>
          <div style={{
            border: "1px dashed var(--border-active)", borderRadius: 22, background: "var(--bg-surface)",
            padding: "34px 20px", textAlign: "center", marginBottom: 4,
          }}>
            <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", color: "var(--text-muted)" }}>{desc}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

function ChartsInner() {
  const searchParams = useSearchParams();
  const [inputTicker, setInputTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticker, setTicker] = useState<string | null>(null);
  const [data, setData] = useState<ChartsData | null>(null);

  // TTM toggles
  const [ttmRevenue, setTtmRevenue] = useState(false);
  const [ttmOCF, setTtmOCF] = useState(false);
  const [ttmOpInc, setTtmOpInc] = useState(false);
  const [ttmFCF, setTtmFCF] = useState(false);
  const [ttmEPS, setTtmEPS] = useState(false);
  const [ttmFCFps, setTtmFCFps] = useState(false);

  // Measure the revenue chart width so per-bar QoQ % labels only render when they
  // actually fit — otherwise they collide into an unreadable smear on small screens.
  const revCardRef = useRef<HTMLDivElement>(null);
  const [revCardW, setRevCardW] = useState(0);
  useEffect(() => {
    const el = revCardRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setRevCardW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => {
    const t = searchParams.get("ticker");
    if (t) { setInputTicker(t.toUpperCase()); handleSubmit(t.toUpperCase()); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TradingView-style type-to-search: typing anywhere (box unfocused) starts a
  // fresh ticker — replacing any prior one, not appending to it.
  const tickerInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement)?.isContentEditable) return;
      if (/^[a-zA-Z0-9.]$/.test(e.key)) {
        const box = tickerInputRef.current;
        if (!box) return;
        e.preventDefault();
        setInputTicker(e.key.toUpperCase());
        box.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleSubmit(symArg?: string) {
    const sym = (symArg ?? inputTicker).trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setError(null);
    setData(null);
    setTicker(sym);
    try {
      const res = await fetch(`/api/charts/${sym}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // FMP returns newest-first — reverse to chronological
      json.income   = [...(json.income   ?? [])].reverse().slice(-20);
      json.cashflow = [...(json.cashflow ?? [])].reverse().slice(-20);
      json.balance  = [...(json.balance  ?? [])].reverse().slice(-20);
      setData(json as ChartsData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  // ── derived chart data ──────────────────────────────────────────────────

  const income          = data?.income          ?? [];
  const cashflow        = data?.cashflow        ?? [];
  const balance         = data?.balance         ?? [];
  const productSegments = data?.productSegments ?? [];
  const geoSegments     = data?.geoSegments     ?? [];
  const estimates       = data?.estimates       ?? [];

  // Future analyst estimates (quarters after the last reported one), oldest first
  const lastReported = income.length > 0 ? income[income.length - 1].date : null;
  const futureEst = lastReported
    ? [...estimates]
        .filter((e) => e.date > lastReported)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 6)
    : [];

  const labels        = income.map((r) => periodLabel(r));
  const cfLabels      = cashflow.map((r) => periodLabel(r));
  const balLabels     = balance.map((r) => periodLabel(r));

  const revenueRaw    = income.map((r) => r.revenue ?? null);
  const revenueTTM    = rollingTTM(revenueRaw as number[]);
  const revenueVals   = ttmRevenue ? revenueTTM : revenueRaw;

  const ocfRaw        = cashflow.map((r) => r.operatingCashFlow ?? null);
  const ocfTTM        = rollingTTM(ocfRaw as number[]);
  const ocfVals       = ttmOCF ? ocfTTM : ocfRaw;

  const opIncRaw      = income.map((r) => r.operatingIncome ?? null);
  const opIncTTM      = rollingTTM(opIncRaw as number[]);
  const opIncVals     = ttmOpInc ? opIncTTM : opIncRaw;

  const grossMargin   = income.map((r) =>
    r.revenue ? (r.grossProfit / r.revenue) * 100 : null
  );
  const netMargin     = income.map((r) =>
    r.revenue ? (r.netIncome / r.revenue) * 100 : null
  );

  const epsRaw        = income.map((r) => r.epsDiluted ?? r.eps ?? null);
  const epsTTMArr     = rollingTTM(epsRaw as number[]);
  const epsVals       = ttmEPS ? epsTTMArr : epsRaw;

  const fcfRaw        = cashflow.map((r) =>
    r.freeCashFlow != null
      ? r.freeCashFlow
      : r.operatingCashFlow != null && r.capitalExpenditure != null
      ? r.operatingCashFlow + r.capitalExpenditure
      : null
  );
  const fcfTTM        = rollingTTM(fcfRaw as number[]);
  const fcfVals       = ttmFCF ? fcfTTM : fcfRaw;

  const sharesVals    = income.map(
    (r) => r.weightedAverageShsOutDil ?? r.weightedAverageShsOut ?? null
  );

  // FCF per share: match cash-flow quarters to income quarters for share counts
  const sharesByDate = new Map<string, number>();
  income.forEach((r) => {
    const sh = r.weightedAverageShsOutDil ?? r.weightedAverageShsOut;
    if (sh) sharesByDate.set(r.date, sh);
  });
  const fcfpsRaw = cashflow.map((r, i) => {
    const fcf = fcfRaw[i];
    const sh = sharesByDate.get(r.date);
    return fcf != null && sh ? fcf / sh : null;
  });
  const fcfpsTTMArr = rollingTTM(fcfpsRaw as number[]);
  const fcfpsVals   = ttmFCFps ? fcfpsTTMArr : fcfpsRaw;

  // Historical PE: quarter-end price ÷ trailing-12-month EPS
  const prices = data?.prices ?? [];
  function priceOnOrBefore(dateStr: string): number | null {
    let best: number | null = null;
    for (const p of prices) {
      if (p.date <= dateStr) best = p.price;
      else break;
    }
    return best;
  }
  // PE is only meaningful with positive earnings; a trough that drops EPS toward
  // zero sends the ratio to hundreds of × — real math, useless signal. Compute
  // the raw series first, then derive a sane display ceiling from the data.
  const peRaw = income.map((r, i) => {
    const ttmEps = epsTTMArr[i];
    const px = priceOnOrBefore(r.date);
    return ttmEps != null && ttmEps > 0.05 && px != null ? px / ttmEps : null;
  });
  const peValid = peRaw.filter((v): v is number => v != null);
  const peSorted = [...peValid].sort((a, b) => a - b);
  const peMedian = peSorted.length ? peSorted[Math.floor(peSorted.length / 2)] : null;
  const peMin = peSorted.length ? peSorted[0] : null;
  const peMax = peSorted.length ? peSorted[peSorted.length - 1] : null;
  // When the ratio swings across an order of magnitude (a trough sends PE to the
  // hundreds), a log axis shows the true spike; a linear one would need clamping
  // and produce a flat plateau. Stable stocks stay linear so their range fills out.
  const peUseLog = peMin != null && peMax != null && peMin > 0 && peMax / peMin > 8;
  let peDomain: [number, number];
  let peTicks: number[];
  if (peUseLog && peMin != null && peMax != null) {
    const lo = Math.pow(10, Math.floor(Math.log10(peMin)));
    const hi = Math.pow(10, Math.ceil(Math.log10(peMax)));
    peDomain = [lo, hi];
    peTicks = logTicks(lo, hi);
  } else {
    const hi = peMax != null ? Math.ceil((peMax * 1.12) / 10) * 10 : 50;
    peDomain = [0, hi];
    const step = hi <= 80 ? 20 : hi <= 160 ? 40 : 50;
    peTicks = [];
    for (let v = 0; v <= hi; v += step) peTicks.push(v);
  }
  const peData = income.map((r, i) => ({ label: labels[i], value: peRaw[i] }));

  // Historical P/S: quarter-end market cap ÷ trailing-12-month revenue.
  // (Revenue rarely craters, so P/S stays in a tight range — plain linear axis.)
  const psRaw = income.map((r, i) => {
    const ttmRev = revenueTTM[i];
    const px = priceOnOrBefore(r.date);
    const sh = r.weightedAverageShsOutDil ?? r.weightedAverageShsOut ?? null;
    return ttmRev != null && ttmRev > 0 && px != null && sh ? (px * sh) / ttmRev : null;
  });
  const psValid = psRaw.filter((v): v is number => v != null).sort((a, b) => a - b);
  const psMedian = psValid.length ? psValid[Math.floor(psValid.length / 2)] : null;
  const psMax = psValid.length ? psValid[psValid.length - 1] : null;
  const psAxisMax = psMax != null ? Math.max(2, Math.ceil(psMax * 1.15)) : 10;
  const psData = income.map((r, i) => ({ label: labels[i], value: psRaw[i] }));

  // Cash / marketable securities / total debt (grouped)
  const cashDebtData = balance.map((r, i) => ({
    label: balLabels[i],
    cash: r.cashAndCashEquivalents ?? null,
    securities: r.shortTermInvestments ?? null,
    debt: r.totalDebt ?? null,
  }));

  // Shareholders' equity (book value) by quarter
  const equityData = balance.map((r, i) => ({
    label: balLabels[i],
    value: r.totalStockholdersEquity ?? r.totalEquity ?? null,
  }));

  // recharts data arrays
  function toBarData<T>(lbls: string[], vals: (T | null)[]) {
    return lbls.map((label, i) => ({ label, value: vals[i] }));
  }

  // Revenue + EPS charts get forecast bars appended. In quarterly view each
  // estimate is a single quarter; in TTM view we roll the estimates into the
  // trailing-four-quarter sum so the dashed bars continue the TTM line.
  const revenueData: { label: string; value: number | null; forecast?: number | null }[] =
    toBarData(labels, revenueVals);
  if (ttmRevenue) {
    const ttmEst = forecastTTM(revenueRaw, futureEst.map((e) => e.revenueAvg ?? null));
    futureEst.forEach((e, j) => {
      if (ttmEst[j] != null) {
        revenueData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: ttmEst[j] });
      }
    });
  } else {
    futureEst.forEach((e) => {
      if (e.revenueAvg != null) {
        revenueData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: e.revenueAvg });
      }
    });
  }
  // QoQ % per bar (vs previous bar's actual or forecast value) — used in the
  // tooltip so the growth read survives even when the on-bar labels are hidden.
  const revSeries: (number | null)[] = revenueData.map((d) => (d.value ?? d.forecast ?? null));
  const revenueDataQ = revenueData.map((d, i) => {
    const cur = revSeries[i], prev = revSeries[i - 1];
    const qoq = i > 0 && cur != null && prev != null && prev !== 0
      ? ((cur - prev) / Math.abs(prev)) * 100 : null;
    return { ...d, qoq };
  });
  const ocfData       = toBarData(cfLabels, ocfVals);
  const opIncData     = toBarData(labels, opIncVals);
  const marginData    = labels.map((label, i) => ({
    label,
    gross: grossMargin[i],
    net:   netMargin[i],
  }));
  const epsData: { label: string; value: number | null; forecast?: number | null }[] =
    toBarData(labels, epsVals);
  if (ttmEPS) {
    const ttmEst = forecastTTM(epsRaw, futureEst.map((e) => e.epsAvg ?? null));
    futureEst.forEach((e, j) => {
      if (ttmEst[j] != null) {
        epsData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: ttmEst[j] });
      }
    });
  } else {
    futureEst.forEach((e) => {
      if (e.epsAvg != null) {
        epsData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: e.epsAvg });
      }
    });
  }
  const fcfData       = toBarData(cfLabels, fcfVals);
  const sharesData    = toBarData(labels, sharesVals);
  const balData       = balLabels.map((label, i) => ({
    label,
    assets:      balance[i]?.totalCurrentAssets      ?? null,
    liabilities: balance[i]?.totalCurrentLiabilities ?? null,
  }));

  // ── segment helpers ───────────────────────────────────────────────────────

  function buildSegmentData(segs: Record<string, unknown>[]) {
    if (!segs || segs.length === 0) return { chartData: [], keys: [] as string[] };
    const rows: { label: string; [k: string]: number | string }[] = [];
    const allKeys = new Set<string>();

    segs.slice(-12).forEach((item) => {
      const dateKey = Object.keys(item).find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
      if (!dateKey) return;
      const segments = item[dateKey] as Record<string, number>;
      if (!segments || typeof segments !== "object") return;
      const d = new Date(dateKey);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const label = `Q${q} '${String(d.getFullYear()).slice(2)}`;
      const row: { label: string; [k: string]: number | string } = { label };
      Object.entries(segments).forEach(([k, v]) => {
        if (typeof v === "number") { row[k] = v; allKeys.add(k); }
      });
      rows.push(row);
    });

    return { chartData: rows, keys: Array.from(allKeys) };
  }

  const { chartData: prodChartData, keys: prodKeys } = buildSegmentData(productSegments as Record<string, unknown>[]);
  const { chartData: geoChartData, keys: geoKeys } = buildSegmentData(geoSegments as Record<string, unknown>[]);

  // ── render helpers ────────────────────────────────────────────────────────

  function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
      <div data-chart-section style={{ ...SECTION_LABEL_STYLE, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span data-section-title>{children}</span>
        {ticker && <ChartShotButton ticker={ticker} companyName={data?.profile?.companyName} />}
      </div>
    );
  }

  function yTickFmt(v: number) {
    return fmtVal(v).replace("$", "");
  }

  function sharesTick(v: number) {
    return fmtShares(v);
  }

  function pctTick(v: number) {
    return `${v.toFixed(0)}%`;
  }

  const profile = data?.profile;

  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <h1
        style={{
          fontFamily: "'Space Grotesk', Georgia, serif",
          fontSize: "1.75rem",
          fontWeight: 500,
          letterSpacing: "-0.02em",
          margin: "0 0 0.2rem",
        }}
      >
        Financial Charts
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.78rem", margin: "0 0 0.75rem" }}>
        Revenue · OCF · Operating Income · Margins · EPS · FCF · FCF/Share · PE · P/S · Shares · Equity · Segments · Cash vs Debt
      </p>

      {/* Gold divider */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right, var(--accent-gold), transparent)",
          marginBottom: "1.25rem",
        }}
      />

      {/* Ticker form */}
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <input
          ref={tickerInputRef}
          value={inputTicker}
          onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") { handleSubmit(); tickerInputRef.current?.blur(); } }}
          placeholder="Type a ticker…"
          style={{
            width: 180,
            padding: "0.5rem 0.75rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 22,
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            fontFamily: "'Spline Sans Mono', monospace",
            outline: "none",
            letterSpacing: "0.04em",
          }}
        />
        <button
          onClick={() => handleSubmit()}
          disabled={loading}
          style={{
            padding: "10px 22px",
            background: "var(--accent-gold)",
            border: "none",
            borderRadius: 22,
            color: "var(--on-accent)",
            fontFamily: "'Public Sans', sans-serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--negative)", fontSize: "0.85rem", marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {/* Company name + badges */}
      {data && ticker && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <CompanyLogo ticker={ticker} size={64} />
          <span
            style={{
              fontFamily: "'Spline Sans Mono', monospace",
              fontSize: "1.3rem",
              fontWeight: 700,
              color: "var(--accent-gold)",
            }}
          >
            {ticker}
          </span>
          {profile?.companyName && (
            <span style={{ color: "var(--text-primary)", fontSize: "0.95rem" }}>
              {profile.companyName}
            </span>
          )}
          {profile?.sector && (
            <span
              style={{
                background: "rgba(var(--accent-rgb), 0.12)",
                border: "1px solid rgba(var(--accent-rgb), 0.3)",
                borderRadius: 24,
                padding: "2px 8px",
                fontSize: "0.7rem",
                color: "var(--accent-gold)",
                fontFamily: "'Public Sans', sans-serif",
              }}
            >
              {profile.sector}
            </span>
          )}
          {profile?.industry && (
            <span
              style={{
                background: "rgba(100,116,139,0.12)",
                border: "1px solid var(--border)",
                borderRadius: 24,
                padding: "2px 8px",
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                fontFamily: "'Public Sans', sans-serif",
              }}
            >
              {profile.industry}
            </span>
          )}
        </div>
      )}

      {!data && !loading && !error && <ChartsEmpty />}

      {/* ── Charts ── */}
      {data && (
        <>
          {/* 1. Revenue */}
          <SectionLabel>Revenue</SectionLabel>
          <TtmToggle isTtm={ttmRevenue} onChange={setTtmRevenue} />
          <div style={CARD_STYLE} ref={revCardRef}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={revenueDataQ} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any, item: any) => {
                    const qoq = item?.payload?.qoq;
                    const suffix = qoq != null ? ` (${qoq >= 0 ? "+" : ""}${qoq.toFixed(1)}% QoQ)` : "";
                    return [`${fmtVal(v)}${suffix}`, name === "forecast" ? "Est. Revenue" : "Revenue"];
                  }}
                />
                <Bar dataKey="value" stackId="rev" fill="var(--accent-gold)" radius={[2, 2, 0, 0]} isAnimationActive={false}
                  label={
                    // Only draw the % labels when each bar has room for the text.
                    (revCardW - 85) / Math.max(1, revenueDataQ.length) >= 42
                      ? <QoQLabel values={revenueDataQ.map((d) => d.value as number)} />
                      : undefined
                  }
                />
                <Bar dataKey="forecast" stackId="rev" fill="var(--accent-gold)" fillOpacity={0.3} stroke="var(--accent-gold)" strokeDasharray="4 3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 2. Operating Cash Flow */}
          <SectionLabel>Operating Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmOCF} onChange={setTtmOCF} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={ocfData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Operating CF"]}
                />
                <Bar dataKey="value" fill="var(--accent-2)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 3. Operating Income */}
          <SectionLabel>Operating Income</SectionLabel>
          <TtmToggle isTtm={ttmOpInc} onChange={setTtmOpInc} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={opIncData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Operating Income"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {opIncData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#22C55E"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 4. Gross & Net Margin */}
          <SectionLabel>Gross &amp; Net Margin</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={marginData} margin={{ top: 14, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={pctTick} tick={Y_TICK} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [
                    `${v.toFixed(1)}%`,
                    name === "gross" ? "Gross Margin" : "Net Margin",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: "Spline Sans Mono, monospace", color: "var(--text-muted)" }}
                  formatter={(v) => (v === "gross" ? "Gross Margin" : "Net Margin")}
                />
                <Line
                  type="monotone"
                  dataKey="gross"
                  stroke="var(--accent-gold)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--accent-gold)" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="var(--accent-2)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--accent-2)" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 5. EPS */}
          <SectionLabel>Earnings Per Share (EPS)</SectionLabel>
          <TtmToggle isTtm={ttmEPS} onChange={setTtmEPS} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={epsData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                  tick={Y_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [`$${v.toFixed(2)}`, name === "forecast" ? "Est. EPS" : "EPS (Diluted)"]}
                />
                <Bar dataKey="value" stackId="eps" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {epsData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#22C55E"}
                    />
                  ))}
                </Bar>
                <Bar dataKey="forecast" stackId="eps" fill="#22C55E" fillOpacity={0.3} stroke="#22C55E" strokeDasharray="4 3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 6. Free Cash Flow */}
          <SectionLabel>Free Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmFCF} onChange={setTtmFCF} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={fcfData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Free Cash Flow"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {fcfData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#14B8A6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 6b. Free Cash Flow Per Share */}
          <SectionLabel>Free Cash Flow Per Share</SectionLabel>
          <TtmToggle isTtm={ttmFCFps} onChange={setTtmFCFps} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={toBarData(cfLabels, fcfpsVals)} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${v.toFixed(2)}`} tick={Y_TICK} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [`$${v.toFixed(2)}`, "FCF / Share"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {toBarData(cfLabels, fcfpsVals).map((entry, i) => (
                    <Cell key={i} fill={(entry.value as number) < 0 ? "#EF4444" : "#10B981"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 6c. Historical PE Ratio */}
          <SectionLabel>Historical PE Ratio</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={peData} margin={{ top: 24, right: 20, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  scale={peUseLog ? "log" : "linear"}
                  domain={peDomain}
                  ticks={peTicks}
                  tickFormatter={(v) => `${v}×`}
                  tick={Y_TICK} axisLine={false} tickLine={false} width={64}
                  allowDataOverflow
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [v == null ? "N/A" : `${Number(v).toFixed(1)}×`, "PE (price ÷ TTM EPS)"]}
                />
                {peMedian != null && (
                  <ReferenceLine
                    y={peMedian}
                    stroke="var(--accent-2)"
                    strokeWidth={1.75}
                    strokeDasharray="7 5"
                    label={{ value: `median ${peMedian.toFixed(0)}×`, position: "insideTopLeft", fill: "var(--accent-2)", fontSize: 13, fontWeight: 700, fontFamily: "Spline Sans Mono, monospace" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#A78BFA"
                  strokeWidth={2.4}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#A78BFA" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", margin: "6px 4px 0" }}>
            Quarter-end price ÷ trailing-12-month diluted EPS.{peUseLog ? " Shown on a log scale — the ratio spans a wide range (usually an earnings trough sending PE to the hundreds)." : ""} Loss-making quarters have no PE and are skipped.
          </div>

          {/* 6d. Historical Price / Sales */}
          <SectionLabel>Historical Price / Sales (P/S)</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={psData} margin={{ top: 24, right: 20, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, psAxisMax]}
                  tickFormatter={(v) => `${v}×`}
                  tick={Y_TICK} axisLine={false} tickLine={false} width={56}
                  allowDataOverflow
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [v == null ? "N/A" : `${Number(v).toFixed(2)}×`, "P/S (mkt cap ÷ TTM rev)"]}
                />
                {psMedian != null && (
                  <ReferenceLine
                    y={psMedian}
                    stroke="var(--accent-2)"
                    strokeWidth={1.75}
                    strokeDasharray="7 5"
                    label={{ value: `median ${psMedian.toFixed(1)}×`, position: "insideTopLeft", fill: "var(--accent-2)", fontSize: 13, fontWeight: 700, fontFamily: "Spline Sans Mono, monospace" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#06B6D4"
                  strokeWidth={2.4}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3, fill: "#06B6D4" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", margin: "6px 4px 0" }}>
            Quarter-end market cap (price × diluted shares) ÷ trailing-12-month revenue. The dashed line marks the historical median.
          </div>

          {/* 7. Shares Outstanding */}
          <SectionLabel>Shares Outstanding</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={sharesData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={sharesTick} tick={Y_TICK} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtShares(v), "Shares Outstanding"]}
                />
                <Bar dataKey="value" fill="var(--text-muted)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 7b. Shareholders' Equity */}
          <SectionLabel>Shareholders&apos; Equity</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={equityData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Shareholders' Equity"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {equityData.map((entry, i) => (
                    <Cell key={i} fill={(entry.value as number) < 0 ? "#EF4444" : "#84CC16"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 9. Revenue by Product */}
          {prodChartData.length > 0 && prodKeys.length > 0 && (
            <>
              <SectionLabel>Revenue by Product</SectionLabel>
              <div style={CARD_STYLE}>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={prodChartData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any, name: any) => [fmtVal(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "Spline Sans Mono, monospace", color: "var(--text-muted)" }} />
                    {prodKeys.map((key, i) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* 10. Revenue by Geography */}
          {geoChartData.length > 0 && geoKeys.length > 0 && (
            <>
              <SectionLabel>Revenue by Geography</SectionLabel>
              <div style={CARD_STYLE}>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={geoChartData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any, name: any) => [fmtVal(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "Spline Sans Mono, monospace", color: "var(--text-muted)" }} />
                    {geoKeys.map((key, i) => (
                      <Bar key={key} dataKey={key} stackId="a" fill={SEGMENT_COLORS[i % SEGMENT_COLORS.length]} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* 8. Current Assets vs Liabilities */}
          <SectionLabel>Current Assets vs Liabilities</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={balData} margin={{ top: 14, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [
                    fmtVal(v),
                    name === "assets" ? "Current Assets" : "Current Liabilities",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: "Spline Sans Mono, monospace", color: "var(--text-muted)" }}
                  formatter={(v) => (v === "assets" ? "Current Assets" : "Current Liabilities")}
                />
                <Line
                  type="monotone"
                  dataKey="assets"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3B82F6" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="liabilities"
                  stroke="#EF4444"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#EF4444" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 11. Cash / Marketable Securities / Debt */}
          <SectionLabel>Cash · Marketable Securities · Debt</SectionLabel>
          <div style={{ ...CARD_STYLE, marginBottom: "2rem" }}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={cashDebtData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={85} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [
                    fmtVal(v),
                    name === "cash" ? "Cash & Equivalents" : name === "securities" ? "Marketable Securities" : "Total Debt",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: "Spline Sans Mono, monospace", color: "var(--text-muted)" }}
                  formatter={(v) => (v === "cash" ? "Cash" : v === "securities" ? "Marketable Securities" : "Debt")}
                />
                <Bar dataKey="cash" stackId="liq" fill="#22C55E" isAnimationActive={false} />
                <Bar dataKey="securities" stackId="liq" fill="#3B82F6" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="debt" fill="#EF4444" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default function ChartsPage() {
  return <Suspense fallback={null}><ChartsInner /></Suspense>;
}
