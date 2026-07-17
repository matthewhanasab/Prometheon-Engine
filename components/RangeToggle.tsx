"use client";

export type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y";

export const RANGES: RangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "5Y"];

// Slice an ascending {date, price}[] series down to the selected window.
export function sliceRange<T extends { date: string }>(data: T[], range: RangeKey): T[] {
  if (!data.length) return data;
  const last = new Date(data[data.length - 1].date);
  let cutoff: Date;
  if (range === "YTD") {
    cutoff = new Date(last.getFullYear(), 0, 1);
  } else if (range === "5Y") {
    return data;
  } else {
    cutoff = new Date(last);
    const months: Record<string, number> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 };
    cutoff.setMonth(cutoff.getMonth() - months[range]);
  }
  const out = data.filter(d => new Date(d.date) >= cutoff);
  return out.length >= 2 ? out : data.slice(-2);
}

export default function RangeToggle({ range, onChange }: {
  range: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  return (
    <div style={{
      display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 999, padding: 3, gap: 2,
    }}>
      {RANGES.map(r => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          style={{
            padding: "5px 11px", borderRadius: 999, border: "none", cursor: "pointer",
            fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.06em",
            background: range === r ? "var(--accent-gold)" : "transparent",
            color: range === r ? "var(--on-accent)" : "var(--text-secondary)",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
        >{r}</button>
      ))}
    </div>
  );
}
