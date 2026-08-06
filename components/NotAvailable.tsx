import Link from "next/link";

// Full-page placeholder for features the current data stack cannot power.
// Honest by design: says what's missing and why, never renders fake numbers.
export default function NotAvailable({ title, reason, alt }: {
  title: string;
  reason: string;
  alt?: { href: string; label: string };
}) {
  return (
    <div style={{ fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        {title}
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.6rem" }} />
      <div style={{
        background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 22,
        padding: "26px 28px", maxWidth: 720,
      }}>
        <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 10 }}>
          Not available with current data
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
          {reason}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {alt && (
            <Link href={alt.href} style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--on-accent)", background: "var(--accent-gold)", borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>
              {alt.label}
            </Link>
          )}
          <Link href="/research" style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>
            ← Stock Research
          </Link>
        </div>
      </div>
    </div>
  );
}
