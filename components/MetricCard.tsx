interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "bad" | "neutral" | "default";
}

const TONES = {
  good:    { top: "var(--positive)", sub: "var(--positive)" },
  bad:     { top: "var(--negative)", sub: "var(--negative)" },
  neutral: { top: "var(--accent-gold)", sub: "var(--accent-gold)" },
  default: { top: "var(--border)", sub: "var(--text-secondary)" },
};

export default function MetricCard({ label, value, sub, tone = "default" }: MetricCardProps) {
  const colors = TONES[tone];
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderTop: `2px solid ${colors.top}`,
      borderRadius: 22,
      padding: "18px 16px 14px",
    }}>
      <div style={{
        fontFamily: "'Public Sans', sans-serif",
        fontSize: "0.6875rem",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-secondary)",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: "'Spline Sans Mono', monospace",
        fontSize: "1.35rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        lineHeight: 1.2,
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: "'Public Sans', sans-serif",
          fontSize: "0.72rem",
          color: colors.sub,
          marginTop: 6,
        }}>{sub}</div>
      )}
    </div>
  );
}
