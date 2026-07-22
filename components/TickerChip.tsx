"use client";
import Link from "next/link";

// A ticker anywhere on the site is a doorway to Stock Research — render it as a
// clickable chip. Pass `plain` for a text-only link that fits inside table cells.
export default function TickerChip({ ticker, plain, size = "md" }: {
  ticker: string;
  plain?: boolean;
  size?: "sm" | "md";
}) {
  const t = ticker.toUpperCase();
  if (plain) {
    return (
      <Link href={`/research?ticker=${encodeURIComponent(t)}`} title={`Research ${t}`} style={{
        color: "var(--accent-gold)", textDecoration: "none",
        fontFamily: "'Spline Sans Mono', monospace", fontWeight: 600,
      }}>
        {t}
      </Link>
    );
  }
  return (
    <Link href={`/research?ticker=${encodeURIComponent(t)}`} title={`Research ${t}`} style={{
      display: "inline-block",
      fontFamily: "'Spline Sans Mono', monospace",
      fontSize: size === "sm" ? "0.66rem" : "0.72rem", fontWeight: 600,
      color: "var(--accent-gold)",
      background: "rgba(var(--accent-rgb), 0.10)",
      border: "1px solid rgba(var(--accent-rgb), 0.28)",
      borderRadius: 999, padding: size === "sm" ? "1px 8px" : "2px 10px",
      textDecoration: "none", whiteSpace: "nowrap",
    }}>
      {t}
    </Link>
  );
}
