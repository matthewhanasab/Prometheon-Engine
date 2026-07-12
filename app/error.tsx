"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{
      minHeight: "60vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 16,
      fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)",
      textAlign: "center", padding: "2rem",
    }}>
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 600 }}>
        Something went wrong loading this page
      </div>
      <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 420, lineHeight: 1.6 }}>
        Usually a temporary data hiccup. Try again — if it keeps happening, the market data source may be having issues.
      </div>
      <button onClick={reset} style={{
        background: "var(--accent-gold)", color: "#04110A", border: "none", borderRadius: 22,
        padding: "10px 26px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", cursor: "pointer", fontFamily: "'Public Sans', sans-serif",
      }}>
        Try Again
      </button>
    </div>
  );
}
