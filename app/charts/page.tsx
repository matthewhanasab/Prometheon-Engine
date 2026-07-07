"use client";

import { useState } from "react";
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
} from "recharts";

const SEGMENT_COLORS = [
  "#C9A84C","#3B82F6","#22C55E","#EF4444","#A78BFA","#F97316",
  "#06B6D4","#EC4899","#84CC16","#F59E0B","#6366F1","#14B8A6",
];

// ─── helpers ────────────────────────────────────────────────────────────────

function qLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} '${String(d.getFullYear()).slice(2)}`;
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

function rollingTTM(arr: number[]): (number | null)[] {
  // arr is chronological (oldest first). TTM[i] = sum of [i-3..i]
  return arr.map((_, i) => {
    if (i < 3) return null;
    const sum = arr[i] + arr[i - 1] + arr[i - 2] + arr[i - 3];
    return isFinite(sum) ? sum : null;
  });
}

// ─── shared chart style ──────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1C2333",
    border: "1px solid #2E4A6E",
    borderRadius: 4,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    color: "#F1F5F9",
  },
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "12px 8px 4px",
};

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: "0.5rem",
  marginTop: "1.5rem",
  letterSpacing: "0.01em",
};

const X_TICK = { fill: "#64748B", fontSize: 9 };
const Y_TICK = { fill: "#64748B", fontSize: 9 };

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
              color: active ? "#0A0F1E" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              padding: "3px 10px",
              fontSize: "0.68rem",
              fontFamily: "Inter, sans-serif",
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
      fontSize={7}
      textAnchor="middle"
      fontFamily="IBM Plex Mono, monospace"
    >
      {label}
    </text>
  );
}

// ─── types ───────────────────────────────────────────────────────────────────

interface IncomeRow {
  date: string;
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
  operatingCashFlow: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
}

interface BalanceRow {
  date: string;
  totalCurrentAssets: number;
  totalCurrentLiabilities: number;
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
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function ChartsPage() {
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

  async function handleSubmit() {
    const sym = inputTicker.trim().toUpperCase();
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

  const labels        = income.map((r) => qLabel(r.date));
  const cfLabels      = cashflow.map((r) => qLabel(r.date));
  const balLabels     = balance.map((r) => qLabel(r.date));

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

  const epsVals       = income.map((r) => r.epsDiluted ?? r.eps ?? null);

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

  // recharts data arrays
  function toBarData<T>(lbls: string[], vals: (T | null)[]) {
    return lbls.map((label, i) => ({ label, value: vals[i] }));
  }

  // Revenue + EPS charts get forecast bars appended (quarterly view only —
  // estimates are per-quarter so they don't line up with TTM sums)
  const revenueData: { label: string; value: number | null; forecast?: number | null }[] =
    toBarData(labels, revenueVals);
  if (!ttmRevenue) {
    futureEst.forEach((e) => {
      if (e.revenueAvg != null) {
        revenueData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: e.revenueAvg });
      }
    });
  }
  const ocfData       = toBarData(cfLabels, ocfVals);
  const opIncData     = toBarData(labels, opIncVals);
  const marginData    = labels.map((label, i) => ({
    label,
    gross: grossMargin[i],
    net:   netMargin[i],
  }));
  const epsData: { label: string; value: number | null; forecast?: number | null }[] =
    toBarData(labels, epsVals);
  futureEst.forEach((e) => {
    if (e.epsAvg != null) {
      epsData.push({ label: `${qLabel(e.date)}E`, value: null, forecast: e.epsAvg });
    }
  });
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
    return <div style={SECTION_LABEL_STYLE}>{children}</div>;
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
    <div style={{ fontFamily: "Inter, sans-serif", color: "var(--text-primary)" }}>
      {/* Header */}
      <h1
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: "2rem",
          fontWeight: 700,
          margin: "0 0 0.2rem",
        }}
      >
        Financial Charts
      </h1>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: "0 0 0.75rem" }}>
        Revenue · OCF · Operating Income · Margins · EPS · FCF · Shares · PE Ratio
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
          value={inputTicker}
          onChange={(e) => setInputTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Ticker symbol…"
          style={{
            width: 180,
            padding: "0.5rem 0.75rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            fontFamily: "'IBM Plex Mono', monospace",
            outline: "none",
            letterSpacing: "0.04em",
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "0.5rem 1.1rem",
            background: "var(--accent-gold)",
            border: "none",
            borderRadius: 6,
            color: "#0A0F1E",
            fontWeight: 700,
            fontSize: "0.875rem",
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
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
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
                background: "rgba(201,168,76,0.12)",
                border: "1px solid rgba(201,168,76,0.3)",
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: "0.7rem",
                color: "var(--accent-gold)",
                fontFamily: "Inter, sans-serif",
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
                borderRadius: 3,
                padding: "2px 8px",
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {profile.industry}
            </span>
          )}
        </div>
      )}

      {/* ── Charts ── */}
      {data && (
        <>
          {/* 1. Revenue */}
          <SectionLabel>Revenue</SectionLabel>
          <TtmToggle isTtm={ttmRevenue} onChange={setTtmRevenue} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={revenueData} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [fmtVal(v), name === "forecast" ? "Est. Revenue" : "Revenue"]}
                />
                <Bar dataKey="value" stackId="rev" fill="#C9A84C" radius={[2, 2, 0, 0]} isAnimationActive={false}
                  label={
                    <QoQLabel
                      values={revenueData.map((d) => d.value as number)}
                    />
                  }
                />
                <Bar dataKey="forecast" stackId="rev" fill="#C9A84C" fillOpacity={0.3} stroke="#C9A84C" strokeDasharray="4 3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 2. Operating Cash Flow */}
          <SectionLabel>Operating Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmOCF} onChange={setTtmOCF} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={ocfData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Operating CF"]}
                />
                <Bar dataKey="value" fill="#ffd600" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 3. Operating Income */}
          <SectionLabel>Operating Income</SectionLabel>
          <TtmToggle isTtm={ttmOpInc} onChange={setTtmOpInc} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={opIncData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Operating Income"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {opIncData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#76ff03"}
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
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={pctTick} tick={Y_TICK} axisLine={false} tickLine={false} width={44} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [
                    `${v.toFixed(1)}%`,
                    name === "gross" ? "Gross Margin" : "Net Margin",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#64748B" }}
                  formatter={(v) => (v === "gross" ? "Gross Margin" : "Net Margin")}
                />
                <Line
                  type="monotone"
                  dataKey="gross"
                  stroke="#f000b8"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f000b8" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#00d4e0"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#00d4e0" }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 5. EPS */}
          <SectionLabel>Earnings Per Share (EPS)</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={epsData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                  tick={Y_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [`$${v.toFixed(2)}`, name === "forecast" ? "Est. EPS" : "EPS (Diluted)"]}
                />
                <Bar dataKey="value" stackId="eps" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {epsData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#00e676"}
                    />
                  ))}
                </Bar>
                <Bar dataKey="forecast" stackId="eps" fill="#00e676" fillOpacity={0.3} stroke="#00e676" strokeDasharray="4 3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 6. Free Cash Flow */}
          <SectionLabel>Free Cash Flow</SectionLabel>
          <TtmToggle isTtm={ttmFCF} onChange={setTtmFCF} />
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={fcfData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtVal(v), "Free Cash Flow"]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {fcfData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={(entry.value as number) < 0 ? "#EF4444" : "#00d4e0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 7. Shares Outstanding */}
          <SectionLabel>Shares Outstanding</SectionLabel>
          <div style={CARD_STYLE}>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={sharesData} margin={{ top: 14, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={sharesTick} tick={Y_TICK} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any) => [fmtShares(v), "Shares Outstanding"]}
                />
                <Bar dataKey="value" fill="#76ff03" radius={[2, 2, 0, 0]} isAnimationActive={false} />
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
                    <CartesianGrid vertical={false} stroke="#1E2D45" />
                    <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any, name: any) => [fmtVal(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#64748B" }} />
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
                    <CartesianGrid vertical={false} stroke="#1E2D45" />
                    <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(v: any, name: any) => [fmtVal(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#64748B" }} />
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
          <div style={{ ...CARD_STYLE, marginBottom: "2rem" }}>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={balData} margin={{ top: 14, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#1E2D45" />
                <XAxis dataKey="label" tick={X_TICK} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={yTickFmt} tick={Y_TICK} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(v: any, name: any) => [
                    fmtVal(v),
                    name === "assets" ? "Current Assets" : "Current Liabilities",
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", color: "#64748B" }}
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
        </>
      )}
    </div>
  );
}
