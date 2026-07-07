"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/research",      label: "Stock Research" },
  { href: "/compare",       label: "Compare Stocks" },
  { href: "/charts",        label: "Charts" },
  { href: "/financials",    label: "Financials" },
  { href: "/covered-calls", label: "Covered Calls" },
  { href: "/projections",   label: "Projections" },
  { href: "/earnings",      label: "Earnings" },
  { href: "/calculator",    label: "Compound Calculator" },
  { href: "/macro",         label: "Macro Dashboard" },
  { href: "/screener",      label: "Screener" },
  { href: "/sec",           label: "SEC Filings" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close sidebar on nav on mobile
  const handleNav = () => { if (isMobile) setOpen(false); };

  // Landing page is full-bleed — no sidebar
  if (pathname === "/") return null;

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && (
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            position: "fixed", top: 14, left: 14, zIndex: 200,
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 8, width: 42, height: 42, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", gap: 5,
          }}
          aria-label="Toggle menu"
        >
          {open ? (
            // X icon
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <line x1="2" y1="2" x2="16" y2="16" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round"/>
              <line x1="16" y1="2" x2="2" y2="16" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            // Hamburger icon
            <>
              <span style={{ width: 20, height: 2, background: "var(--text-primary)", borderRadius: 2 }} />
              <span style={{ width: 20, height: 2, background: "var(--text-primary)", borderRadius: 2 }} />
              <span style={{ width: 20, height: 2, background: "var(--text-primary)", borderRadius: 2 }} />
            </>
          )}
        </button>
      )}

      {/* Overlay on mobile when sidebar open */}
      {isMobile && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            background: "rgba(0,0,0,0.5)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 220,
        minWidth: 220,
        background: "var(--bg-primary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "2rem 0",
        // Mobile: fixed overlay sidebar
        ...(isMobile ? {
          position: "fixed",
          top: 0, left: 0, bottom: 0,
          zIndex: 150,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
        } : {}),
      }}>
        {/* Logo */}
        <div style={{ padding: "0 1.5rem 2rem", textAlign: "center" }}>
          <Link href="/research" onClick={handleNav} style={{ display: "inline-block", lineHeight: 0 }}>
            <Image
              src="/logo_transparent.png"
              alt="Prometheon Engine"
              width={180}
              height={58}
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
              <Link key={href} href={href} onClick={handleNav} style={{
                display: "block",
                padding: "0.75rem 1.75rem",
                fontSize: "0.85rem",
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                textDecoration: "none",
                borderLeft: active ? "3px solid var(--accent-gold)" : "3px solid transparent",
                background: active ? "var(--bg-elevated)" : "transparent",
                transition: "all 0.1s ease",
                whiteSpace: "nowrap",
              }}>
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
