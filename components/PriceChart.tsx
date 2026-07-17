"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface PricePoint { date: string; price: number; }

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// "2021-07-19" parses as UTC midnight, which renders as the previous day in any
// negative-offset timezone. Anchor to local midnight so the date shown is the date given.
const asLocal = (d: string) => new Date(`${d}T00:00:00`);
const longDate = (d: string) =>
  asLocal(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default function PriceChart({ data, label }: { data: PricePoint[]; label?: string }) {
  // Return over the visible window — recomputed whenever the range changes.
  const first = data[0]?.price;
  const last  = data[data.length - 1]?.price;
  const chg    = data.length > 1 && first != null && last != null ? last - first : null;
  const chgPct = chg != null && first ? (chg / first) * 100 : null;
  const positive = chg == null ? true : chg >= 0;
  const color = positive ? "#22C55E" : "#EF4444";

  // Short windows need day-level labels; long ones would repeat the same month.
  const spanDays = data.length > 1
    ? (new Date(data[data.length - 1].date).getTime() - new Date(data[0].date).getTime()) / 86400000
    : 0;
  const tickOpts: Intl.DateTimeFormatOptions = spanDays <= 200
    ? { month: "short", day: "numeric" }
    : { month: "short", year: "2-digit" };
  const tickInterval = Math.max(0, Math.floor(data.length / 6));

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 22,
      padding: "1.25rem 1rem 0.75rem",
    }}>
      {chg != null && chgPct != null && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", padding: "0 6px 0.9rem" }}>
          <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "1.15rem", fontWeight: 600, color }}>
            {positive ? "▲" : "▼"} {chgPct >= 0 ? "+" : ""}{chgPct.toFixed(2)}%
          </span>
          <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.85rem", fontWeight: 500, color }}>
            {chg >= 0 ? "+" : "−"}{fmt(Math.abs(chg))}
          </span>
          {label && (
            <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 9px" }}>
              {label}
            </span>
          )}
          <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.66rem", color: "var(--text-muted)" }}>
            {longDate(data[0].date)} → {longDate(data[data.length - 1].date)}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => asLocal(v).toLocaleString("en-US", tickOpts)}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "Spline Sans Mono" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: "var(--text-muted)", fontSize: 10, fontFamily: "Spline Sans Mono" }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
                  cursor={{ fill: "var(--cursor-fill)" }}
            contentStyle={{
              background: "var(--tooltip-bg)",
              border: "1px solid var(--tooltip-border)",
              borderRadius: 22,
              fontFamily: "Spline Sans Mono",
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            formatter={(v: any) => [fmt(v), "Price"]}
            labelFormatter={(d: any) => longDate(String(d))}
            labelStyle={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={1.5}
            fill="url(#priceGrad)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
