"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ── types ──────────────────────────────────────────────────────────────────────
interface FredSeries {
  date: string;
  value: number;
}

interface MarketQuote {
  symbol: string;
  price: number;
  changesPercentage: number;
  name?: string;
}

interface MacroData {
  fred: {
    ffr: FredSeries[];
    gs10: FredSeries[];
    gs2: FredSeries[];
    spread: FredSeries[];
    cpiYoy: FredSeries[];
    pceYoy: FredSeries[];
    bei: FredSeries[];
    unemp: FredSeries[];
    claims: FredSeries[];
    sentiment: FredSeries[];
    vix: FredSeries[];
  };
  markets: MarketQuote[];
}

// ── helpers ────────────────────────────────────────────────────────────────────
function fmt(n: number | undefined | null, dec = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtK(n: number | undefined | null): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function last(arr: FredSeries[]): number | null {
  return arr.length ? arr[arr.length - 1].value : null;
}

function tickDate(str: any): string {
  // "2023-04-01" → "Apr '23"
  const d = new Date(str + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function thinDate(arr: FredSeries[], maxTicks = 6): FredSeries[] {
  if (arr.length <= maxTicks) return arr;
  const step = Math.floor(arr.length / maxTicks);
  return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
}

// ── sub-components ─────────────────────────────────────────────────────────────
function SL({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "Inter,sans-serif",
        fontSize: "0.58rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.16em",
        color: "var(--text-secondary)",
        borderBottom: "1px solid var(--border)",
        paddingBottom: "0.5rem",
        marginBottom: "1rem",
        marginTop: "2rem",
      }}
    >
      {children}
    </div>
  );
}

function ChartCard({
  children,
  height = 270,
  title,
}: {
  children: React.ReactNode;
  height?: number;
  title?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "12px 8px 4px",
        height,
      }}
    >
      {title && (
        <div
          style={{
            fontFamily: "Inter,sans-serif",
            fontSize: "0.65rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: 8,
            paddingLeft: 8,
          }}
        >
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

const ttStyle = {
  contentStyle: {
    background: "#1E2D45",
    border: "1px solid #2E4A6E",
    borderRadius: 4,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    color: "#F1F5F9",
  },
  labelStyle: { color: "#64748B" },
};

function XAx() {
  return (
    <XAxis
      dataKey="date"
      tickFormatter={tickDate}
      tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }}
      axisLine={false}
      tickLine={false}
      interval="preserveStartEnd"
    />
  );
}

function YAx({
  unit = "",
  domain,
}: {
  unit?: string;
  domain?: [number | string, number | string];
}) {
  return (
    <YAxis
      tickFormatter={(v) => `${v}${unit}`}
      tick={{ fill: "#64748B", fontSize: 9, fontFamily: "IBM Plex Mono" }}
      axisLine={false}
      tickLine={false}
      width={44}
      domain={domain}
    />
  );
}

function Grid() {
  return (
    <CartesianGrid vertical={false} stroke="#1A2640" strokeDasharray="3 3" />
  );
}

// Snapshot metric card
function MCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bad" | "good" | "neutral";
}) {
  const subColor =
    tone === "bad"
      ? "var(--negative)"
      : tone === "good"
      ? "var(--positive)"
      : "var(--text-secondary)";
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: "Inter,sans-serif",
          fontSize: "0.6rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: "1.5rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "Inter,sans-serif",
            fontSize: "0.65rem",
            color: subColor,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// Spread area chart — split positive/negative
function SpreadChart({ data }: { data: FredSeries[] }) {
  const pos = data.map((d) => ({
    ...d,
    pos: d.value >= 0 ? d.value : 0,
    neg: d.value < 0 ? d.value : 0,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={pos} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <Grid />
        <XAx />
        <YAx unit="%" />
        <Tooltip
          {...ttStyle}
          formatter={(v: any) => [`${v.toFixed(2)}%`, "Spread"]}
          labelFormatter={tickDate}
        />
        <ReferenceLine y={0} stroke="#64748B" strokeWidth={1} />
        <Area
          type="monotone"
          dataKey="pos"
          stroke="#22C55E"
          fill="rgba(34,197,94,0.10)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          name="Positive"
        />
        <Area
          type="monotone"
          dataKey="neg"
          stroke="#EF4444"
          fill="rgba(239,68,68,0.15)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          name="Negative"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Market card
const MARKET_META: Record<
  string,
  { label: string; color: string }
> = {
  SPY: { label: "S&P 500", color: "#22C55E" },
  QQQ: { label: "Nasdaq", color: "#3B82F6" },
  GLD: { label: "Gold", color: "#C9A84C" },
  USO: { label: "Crude Oil", color: "#F97316" },
  BTCUSD: { label: "Bitcoin", color: "#F59E0B" },
  UUP: { label: "USD Index", color: "#8B5CF6" },
};

function MarketCard({ q }: { q: MarketQuote }) {
  const meta = MARKET_META[q.symbol] ?? { label: q.symbol, color: "#64748B" };
  const up = q.changesPercentage >= 0;
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderTop: `2px solid ${meta.color}`,
        borderRadius: 4,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: "Inter,sans-serif",
          fontSize: "0.58rem",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--text-secondary)",
        }}
      >
        {meta.label}
      </div>
      <div
        style={{
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: "1.35rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
        }}
      >
        {q.symbol === "BTCUSD"
          ? "$" + fmtK(q.price)
          : "$" + fmt(q.price)}
      </div>
      <div
        style={{
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: "0.72rem",
          color: up ? "var(--positive)" : "var(--negative)",
        }}
      >
        {up ? "+" : ""}
        {fmt(q.changesPercentage, 2)}% today
      </div>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function MacroPage() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/macro")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div
        style={{
          color: "var(--text-secondary)",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: "0.8rem",
          padding: "3rem 0",
          textAlign: "center",
        }}
      >
        Loading macro data…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ color: "var(--negative)", padding: "2rem 0" }}>
        Failed to load macro data: {error}
      </div>
    );
  }

  const { fred, markets } = data;

  // snapshot values
  const ffrVal = last(fred.ffr);
  const gs10Val = last(fred.gs10);
  const gs2Val = last(fred.gs2);
  const spreadVal = last(fred.spread);
  const cpiVal = last(fred.cpiYoy);
  const pceVal = last(fred.pceYoy);
  const unempVal = last(fred.unemp);
  const vixVal = last(fred.vix);
  const beiVal = last(fred.bei);

  const snapCards = [
    {
      label: "Fed Funds Rate",
      value: ffrVal != null ? `${fmt(ffrVal)}%` : "—",
      sub: undefined,
      tone: "neutral" as const,
    },
    {
      label: "10Y Treasury",
      value: gs10Val != null ? `${fmt(gs10Val)}%` : "—",
      sub: undefined,
      tone: "neutral" as const,
    },
    {
      label: "Yield Spread",
      value: spreadVal != null ? `${fmt(spreadVal)}%` : "—",
      sub: spreadVal != null ? (spreadVal < 0 ? "Inverted" : "Normal") : undefined,
      tone:
        spreadVal != null
          ? spreadVal < 0
            ? ("bad" as const)
            : ("good" as const)
          : ("neutral" as const),
    },
    {
      label: "CPI YoY",
      value: cpiVal != null ? `${fmt(cpiVal)}%` : "—",
      sub: cpiVal != null && cpiVal > 3.5 ? "Above target" : "Moderating",
      tone:
        cpiVal != null && cpiVal > 3.5 ? ("bad" as const) : ("good" as const),
    },
    {
      label: "PCE YoY",
      value: pceVal != null ? `${fmt(pceVal)}%` : "—",
      sub: "Fed target 2%",
      tone:
        pceVal != null && pceVal > 3.5 ? ("bad" as const) : ("neutral" as const),
    },
    {
      label: "Unemployment",
      value: unempVal != null ? `${fmt(unempVal)}%` : "—",
      sub: undefined,
      tone: "neutral" as const,
    },
    {
      label: "VIX",
      value: vixVal != null ? fmt(vixVal, 1) : "—",
      sub: vixVal != null && vixVal > 25 ? "Elevated" : "Normal",
      tone:
        vixVal != null && vixVal > 25 ? ("bad" as const) : ("good" as const),
    },
    {
      label: "10Y Breakeven",
      value: beiVal != null ? `${fmt(beiVal)}%` : "—",
      sub: undefined,
      tone: "neutral" as const,
    },
  ];

  // merge FFR/GS10/GS2 by date
  const gs10Map = new Map(fred.gs10.map((d) => [d.date, d.value]));
  const gs2Map = new Map(fred.gs2.map((d) => [d.date, d.value]));
  const rateData = fred.ffr.map((d) => ({
    date: d.date,
    ffr: d.value,
    gs10: gs10Map.get(d.date),
    gs2: gs2Map.get(d.date),
  }));

  // merge CPI/PCE by date
  const pceMap = new Map(fred.pceYoy.map((d) => [d.date, d.value]));
  const inflData = fred.cpiYoy.map((d) => ({
    date: d.date,
    cpi: d.value,
    pce: pceMap.get(d.date),
  }));

  const chartH = 230;

  return (
    <div style={{ fontFamily: "Inter,sans-serif" }}>
      {/* Header */}
      <h1
        style={{
          fontFamily: "'Playfair Display',Georgia,serif",
          fontSize: "1.75rem",
          fontWeight: 500,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          marginBottom: "0.35rem",
        }}
      >
        Macro Dashboard
      </h1>
      <div
        style={{
          fontSize: "0.78rem",
          color: "var(--text-secondary)",
          marginBottom: "0.9rem",
        }}
      >
        Interest rates · Inflation · Labor · Markets · Recession signals · FRED
      </div>
      <div
        style={{
          height: 1,
          background: "linear-gradient(to right,var(--accent-gold),transparent)",
          opacity: 0.45,
          maxWidth: 300,
          marginBottom: "1.5rem",
        }}
      />

      {/* 1. Snapshot */}
      <SL>Snapshot</SL>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8,
          marginBottom: "0.5rem",
        }}
      >
        {snapCards.map((c) => (
          <MCard
            key={c.label}
            label={c.label}
            value={c.value}
            sub={c.sub}
            tone={c.tone}
          />
        ))}
      </div>

      {/* 2. Interest Rates */}
      <SL>Interest Rates</SL>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartCard height={chartH + 40} title="Policy Rate vs Treasury Yields">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart
              data={rateData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx unit="%" />
              <Tooltip
                {...ttStyle}
                formatter={(v: any, name: any) => [
                  `${fmt(v)}%`,
                  name === "ffr"
                    ? "Fed Funds"
                    : name === "gs10"
                    ? "10Y"
                    : "2Y",
                ]}
                labelFormatter={tickDate}
              />
              <Line
                type="monotone"
                dataKey="ffr"
                stroke="#C9A84C"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="ffr"
              />
              <Line
                type="monotone"
                dataKey="gs10"
                stroke="#3B82F6"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                name="gs10"
              />
              <Line
                type="monotone"
                dataKey="gs2"
                stroke="#8B5CF6"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
                name="gs2"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard height={chartH + 40} title="Yield Curve — 10Y minus 2Y">
          <div style={{ height: chartH }}>
            <SpreadChart data={fred.spread} />
          </div>
        </ChartCard>
      </div>

      {/* 3. Inflation */}
      <SL>Inflation</SL>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartCard height={chartH + 40} title="CPI & PCE — Year-over-Year">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart
              data={inflData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx unit="%" />
              <Tooltip
                {...ttStyle}
                formatter={(v: any, name: any) => [
                  `${fmt(v)}%`,
                  name === "cpi" ? "CPI YoY" : "PCE YoY",
                ]}
                labelFormatter={tickDate}
              />
              <ReferenceLine
                y={2}
                stroke="#C9A84C"
                strokeDasharray="5 3"
                label={{
                  value: "2%",
                  fill: "#C9A84C",
                  fontSize: 9,
                  fontFamily: "IBM Plex Mono",
                }}
              />
              <Line
                type="monotone"
                dataKey="cpi"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                name="cpi"
              />
              <Line
                type="monotone"
                dataKey="pce"
                stroke="#F97316"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
                name="pce"
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard height={chartH + 40} title="10Y Breakeven Inflation">
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={fred.bei}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx unit="%" />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [`${fmt(v)}%`, "10Y Breakeven"]}
                labelFormatter={tickDate}
              />
              <ReferenceLine
                y={2}
                stroke="#C9A84C"
                strokeDasharray="5 3"
                label={{
                  value: "2%",
                  fill: "#C9A84C",
                  fontSize: 9,
                  fontFamily: "IBM Plex Mono",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#A78BFA"
                fill="rgba(167,139,250,0.08)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 4. Labor Market */}
      <SL>Labor Market</SL>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 12,
        }}
      >
        <ChartCard height={chartH + 40} title="Unemployment Rate">
          <ResponsiveContainer width="100%" height={chartH}>
            <LineChart
              data={fred.unemp}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx unit="%" />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [`${fmt(v)}%`, "Unemployment"]}
                labelFormatter={tickDate}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#F97316"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard height={chartH + 40} title="Initial Jobless Claims">
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={fred.claims}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [fmtK(v), "Init. Claims"]}
                labelFormatter={tickDate}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#22C55E"
                fill="rgba(34,197,94,0.07)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard height={chartH + 40} title="Consumer Sentiment">
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={fred.sentiment}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [fmt(v, 1), "Sentiment"]}
                labelFormatter={tickDate}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#A78BFA"
                fill="rgba(167,139,250,0.08)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 5. Markets */}
      <SL>Markets Overview</SL>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {["SPY", "QQQ", "GLD", "USO", "BTCUSD", "UUP"].map((sym) => {
          const q = markets.find((m) => m.symbol === sym);
          if (!q) return null;
          return <MarketCard key={sym} q={q} />;
        })}
      </div>

      {/* 6. Recession Watch */}
      <SL>Recession Watch</SL>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <ChartCard height={chartH + 40} title="VIX — Market Fear Index">
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={fred.vix}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [fmt(v, 1), "VIX"]}
                labelFormatter={tickDate}
              />
              <ReferenceLine
                y={20}
                stroke="#C9A84C"
                strokeDasharray="4 3"
                label={{
                  value: "Caution",
                  fill: "#C9A84C",
                  fontSize: 9,
                  fontFamily: "IBM Plex Mono",
                }}
              />
              <ReferenceLine
                y={30}
                stroke="#EF4444"
                strokeDasharray="4 3"
                label={{
                  value: "Fear",
                  fill: "#EF4444",
                  fontSize: 9,
                  fontFamily: "IBM Plex Mono",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#EF4444"
                fill="rgba(239,68,68,0.08)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          height={chartH + 40}
          title="Consumer Sentiment — U. of Michigan"
        >
          <ResponsiveContainer width="100%" height={chartH}>
            <AreaChart
              data={fred.sentiment}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <Grid />
              <XAx />
              <YAx />
              <Tooltip
                {...ttStyle}
                formatter={(v: any) => [fmt(v, 1), "Sentiment"]}
                labelFormatter={tickDate}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#A78BFA"
                fill="rgba(167,139,250,0.09)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "3rem",
          paddingTop: "1rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.62rem",
          color: "var(--text-secondary)",
          fontFamily: "Inter,sans-serif",
          textAlign: "center",
        }}
      >
        FRED · Federal Reserve Bank of St. Louis · All series cached 6 hrs ·
        Not financial advice
      </div>
    </div>
  );
}
