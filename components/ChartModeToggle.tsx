"use client";

export type ChartMode = "builtin" | "tv";

export default function ChartModeToggle({ mode, onChange }: {
  mode: ChartMode;
  onChange: (m: ChartMode) => void;
}) {
  return (
    <div style={{
      display: "inline-flex", background: "var(--bg-elevated)", border: "1px solid var(--border)",
      borderRadius: 999, padding: 3, gap: 2,
    }}>
      {([
        { key: "builtin" as const, label: "Built-in" },
        { key: "tv"      as const, label: "TradingView" },
      ]).map(opt => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          style={{
            padding: "6px 14px", borderRadius: 999, border: "none", cursor: "pointer",
            fontFamily: "'Public Sans', sans-serif", fontSize: "0.64rem", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "0.06em",
            background: mode === opt.key ? "var(--accent-gold)" : "transparent",
            color: mode === opt.key ? "var(--on-accent)" : "var(--text-secondary)",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
        >{opt.label}</button>
      ))}
    </div>
  );
}
