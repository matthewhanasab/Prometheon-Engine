"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Sub-navigation for the Market Stack edition — the FMP-free mirror of the
// site. Every page reachable from here runs on marketstack + SEC EDGAR + FRED
// + the TradingView widget only.
const ITEMS = [
  { href: "/ms", label: "Hub" },
  { href: "/marketstack", label: "Research" },
  { href: "/ms/compare", label: "Compare" },
  { href: "/ms/charts", label: "Charts" },
  { href: "/ms/dividends", label: "Dividends" },
];

export default function MsNav() {
  const pathname = usePathname();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      marginBottom: "1.6rem", paddingBottom: "0.9rem",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{
        fontFamily: "'Public Sans', sans-serif", fontSize: "0.56rem", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.14em",
        color: "var(--on-accent)", background: "var(--accent-gold)",
        borderRadius: 999, padding: "3px 10px",
      }}>
        Market Stack Edition
      </span>
      {ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link key={it.href} href={it.href} style={{
            fontFamily: "'Public Sans', sans-serif", fontSize: "0.72rem", fontWeight: 600,
            color: active ? "var(--accent-gold)" : "var(--text-secondary)",
            background: "var(--bg-elevated)",
            border: `1px solid ${active ? "var(--accent-gold)" : "var(--border)"}`,
            borderRadius: 999, padding: "4px 13px", textDecoration: "none",
          }}>
            {it.label}
          </Link>
        );
      })}
      <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", color: "var(--text-muted)", marginLeft: "auto" }}>
        no FMP data on these pages
      </span>
    </div>
  );
}
