interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "good" | "bad" | "neutral" | "default";
}

const TONES = {
  good:    { top: "#7A9B4E", sub: "#7A9B4E" },
  bad:     { top: "#C25B4E", sub: "#C25B4E" },
  neutral: { top: "#C9A84C", sub: "#C9A84C" },
  default: { top: "var(--border)", sub: "var(--text-secondary)" },
};

export default function MetricCard({ label, value, sub, tone = "default" }: MetricCardProps) {
  const colors = TONES[tone];
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      borderTop: `2px solid ${colors.top}`,
      borderRadius: 4,
      padding: "18px 16px 14px",
    }}>
      <div style={{
        fontFamily: "'Inter', sans-serif",
        fontSize: "0.60rem",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "var(--text-secondary)",
        marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: "1.35rem",
        fontWeight: 600,
        color: "var(--text-primary)",
        lineHeight: 1.2,
      }}>{value}</div>
      {sub && (
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: "0.68rem",
          color: colors.sub,
          marginTop: 6,
        }}>{sub}</div>
      )}
    </div>
  );
}
