"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)",
      textAlign: "center", padding: "2rem",
    }}>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
        This page didn&apos;t load
      </h1>
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6, margin: 0 }}>
        Usually a momentary problem reaching the market data. Try again; if it keeps happening, the data service may be down for a while.
      </p>
      <button type="button" onClick={reset} style={{
        background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22,
        padding: "10px 24px", fontSize: "0.8rem", fontWeight: 700,
        cursor: "pointer", fontFamily: "'Public Sans', sans-serif",
      }}>
        Try again
      </button>
    </div>
  );
}
