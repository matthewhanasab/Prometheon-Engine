"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/research",    label: "Stock Research" },
  { href: "/compare",     label: "Compare Stocks" },
  { href: "/charts",      label: "Charts" },
  { href: "/financials",  label: "Financials" },
  { href: "/covered-calls", label: "Covered Calls" },
  { href: "/projections", label: "Projections" },
  { href: "/earnings",    label: "Earnings" },
  { href: "/calculator",  label: "Compound Calculator" },
  { href: "/macro",       label: "Macro Dashboard" },
  { href: "/sec",         label: "SEC Filings" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: 280,
      minWidth: 280,
      background: "var(--bg-primary)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      padding: "2rem 0",
    }}>
      {/* Logo */}
      <div style={{ padding: "0 1.5rem 2rem", textAlign: "center" }}>
        <Link href="/research" style={{ display: "inline-block", lineHeight: 0 }}>
          <Image
            src="/logo_transparent.png"
            alt="Prometheon Engine"
            width={220}
            height={70}
            style={{ objectFit: "contain" }}
            priority
          />
        </Link>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", marginBottom: "1.25rem" }} />

      <nav style={{ flex: 1 }}>
        {NAV.map(({ href, label }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link key={href} href={href} style={{
              display: "block",
              padding: "0.75rem 1.75rem",
              fontSize: "0.9rem",
              fontFamily: "'Inter', sans-serif",
              fontWeight: active ? 600 : 400,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              textDecoration: "none",
              borderLeft: active ? "3px solid var(--accent-gold)" : "3px solid transparent",
              background: active ? "var(--bg-elevated)" : "transparent",
              transition: "all 0.1s ease",
            }}>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
