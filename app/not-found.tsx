import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

// Branded 404. The framework default was a bare "404 | This page could not
// be found" with no way back in.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

export default function NotFound() {
  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      textAlign: "center", padding: "2rem", fontFamily: SANS, color: "var(--text-primary)",
    }}>
      <div style={{ fontFamily: MONO, fontSize: "0.7rem", letterSpacing: "0.2em", color: "var(--accent-gold)", marginBottom: 10 }}>404</div>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.6rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.6rem" }}>
        That page isn&apos;t listed
      </h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6, margin: "0 0 1.4rem" }}>
        The address may have changed, or it never existed. Try a ticker instead.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        <Link href="/research" className="pressable" style={{
          background: "var(--accent-gold)", color: "var(--on-accent)", borderRadius: 999, padding: "10px 22px",
          fontSize: "0.74rem", fontWeight: 700, textDecoration: "none",
        }}>Stock Research</Link>
        {[["/compare", "Compare"], ["/charts", "Charts"], ["/mna", "M&A Activity"], ["/", "Home"]].map(([href, label]) => (
          <Link key={href} href={href} className="pressable" style={{
            background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)",
            borderRadius: 999, padding: "10px 18px", fontSize: "0.74rem", fontWeight: 600, textDecoration: "none",
          }}>{label}</Link>
        ))}
      </div>
    </div>
  );
}
