"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface PricePoint { date: string; price: number; }

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PriceChart({ data, positive }: { data: PricePoint[]; positive: boolean }) {
  const color = positive ? "#22C55E" : "#EF4444";

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderRadius: 4,
      padding: "1.25rem 1rem 0.75rem",
    }}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#35456A" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              const d = new Date(v);
              return d.toLocaleString("en-US", { month: "short", year: "2-digit" });
            }}
            tick={{ fill: "#64748B", fontSize: 10, fontFamily: "Spline Sans Mono" }}
            axisLine={false}
            tickLine={false}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v}`}
            tick={{ fill: "#64748B", fontSize: 10, fontFamily: "Spline Sans Mono" }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
                  cursor={{ fill: "rgba(76, 97, 144, 0.18)" }}
            contentStyle={{
              background: "#283552",
              border: "1px solid #4C6190",
              borderRadius: 4,
              fontFamily: "Spline Sans Mono",
              fontSize: 12,
              color: "#F1F5F9",
            }}
            formatter={(v: any) => [fmt(v), "Price"]}
            labelStyle={{ color: "#64748B", fontSize: 10, marginBottom: 4 }}
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
