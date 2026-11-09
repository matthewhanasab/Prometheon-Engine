// The header every app page opens with: title, the short accent rule, one
// line saying what the page is for. Defined once so the type, spacing and rule
// are identical across the site instead of retyped per page.
export default function PageHeader({ title, subtitle, children }: {
  title: string;
  subtitle?: React.ReactNode;
  /** Optional controls on the right of the title row (desktop) or below it. */
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px 24px", flexWrap: "wrap" }}>
        <h1 style={{
          fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500,
          letterSpacing: "-0.02em", lineHeight: 1.15, margin: 0, color: "var(--text-primary)",
        }}>
          {title}
        </h1>
        {children}
      </div>
      <div aria-hidden style={{
        height: 1, maxWidth: 200, margin: "0.7rem 0",
        background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.5,
      }} />
      {subtitle && (
        <p style={{
          fontFamily: "'Public Sans', sans-serif", fontSize: "0.85rem", lineHeight: 1.55,
          color: "var(--text-secondary)", margin: 0, maxWidth: "70ch",
        }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
