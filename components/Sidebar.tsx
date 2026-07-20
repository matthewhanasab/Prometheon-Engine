"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  { href: "/research",      label: "Stock Research" },
  { href: "/fairvalue",     label: "Fair Value Graph" },
  { href: "/portfolio",     label: "My Portfolio" },
  { href: "/compare",       label: "Compare Stocks" },
  { href: "/etf",           label: "ETF Hub" },
  { href: "/charts",        label: "Charts" },
  { href: "/financials",    label: "Financials" },
  { href: "/covered-calls", label: "Covered Calls" },
  { href: "/puts",          label: "Cash-Secured Puts" },
  { href: "/dividends",     label: "Dividends" },
  { href: "/projections",   label: "Projections" },
  { href: "/earnings",      label: "Earnings" },
  { href: "/congress",      label: "Congress Trades" },
  { href: "/insider",       label: "Insider Trading" },
  { href: "/calculator",    label: "Compound Calculator" },
  { href: "/macro",         label: "Macro Dashboard" },
  { href: "/movers",        label: "Market Movers" },
  { href: "/screener",      label: "Screener" },
  { href: "/sec",           label: "SEC Filings" },
];

// Full wordmark, theme-swapped. File names are misleading:
// logo_transparent_dark.png = dark navy text (needs a LIGHT backdrop),
// logo_transparent.png = white text (needs a DARK backdrop).
function Brand({ width = 180 }: { width?: number }) {
  const height = Math.round((width * 605) / 1953);
  const style: React.CSSProperties = { width, height, objectFit: "contain" };
  return (
    <>
      <Image src="/logo_transparent_dark.png" alt="Prometheon Engine" className="logo-on-light"
        width={width} height={height} style={style} priority />
      <Image src="/logo_transparent.png" alt="Prometheon Engine" className="logo-on-dark"
        width={width} height={height} style={style} priority />
    </>
  );
}

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

  const onLanding = pathname === "/";

  // Content pads itself under the fixed brand bar (rule lives in layout.tsx)
  useEffect(() => {
    const el = document.documentElement;
    if (onLanding) { delete el.dataset.topbar; return; }
    el.dataset.topbar = "1";
    return () => { delete el.dataset.topbar; };
  }, [onLanding]);

  // Close the drawer on navigation and on Escape
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Landing page is full-bleed — no chrome at all
  if (onLanding) return null;

  const BAR_H = isMobile ? 56 : 72;
  const logoW = isMobile ? 128 : 185;

  return (
    <>
      {/* ── Fixed brand bar: the logo owns the top-left, always ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: BAR_H, zIndex: 210,
        display: "flex", alignItems: "center",
        padding: isMobile ? "0 12px" : "0 20px",
        background: "var(--bg-primary)",
        borderBottom: "1px solid var(--border)",
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <Brand width={logoW} />
        </Link>
      </div>

      {/* ── Left-edge pull tab: opens the nav; rides the drawer's edge when open ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? "Close navigation" : "Open navigation menu"}
        aria-expanded={open}
        title={open ? "Close menu" : "Open menu"}
        className={open ? undefined : "nav-edge-tab"}
        style={{
          position: "fixed", top: "50%", left: open ? 236 : 0, transform: "translateY(-50%)",
          zIndex: 220, cursor: "pointer", padding: 0,
          width: 34, height: open ? 66 : 108,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
          background: "var(--accent-gold)",
          border: "1px solid var(--accent-gold)", borderLeft: "none",
          borderTopRightRadius: 16, borderBottomRightRadius: 16,
          color: "var(--on-accent)",
          transition: "left 0.22s ease, height 0.2s ease",
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ display: "block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s ease" }}>
          <path d="M9 6l6 6-6 6" />
        </svg>
        {!open && (
          <span style={{
            writingMode: "vertical-rl", transform: "rotate(180deg)",
            fontFamily: "'Public Sans', sans-serif", fontSize: "0.62rem", fontWeight: 700,
            letterSpacing: "0.18em", textTransform: "uppercase", lineHeight: 1,
          }}>
            Menu
          </span>
        )}
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div onClick={() => setOpen(false)} aria-hidden style={{
          position: "fixed", left: 0, right: 0, top: BAR_H, bottom: 0, zIndex: 195,
          background: "rgba(0,0,0,0.45)",
        }} />
      )}

      {/* ── Slide-in nav drawer ── */}
      <aside style={{
        position: "fixed", top: BAR_H, left: 0, bottom: 0, zIndex: 200,
        width: 236, background: "var(--bg-primary)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
        padding: "0.9rem 0 1.5rem",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s ease",
        boxShadow: open ? "6px 0 28px rgba(0,0,0,0.35)" : "none",
      }}>
        <nav style={{ flex: 1 }}>
          {NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)} style={{
                display: "block",
                padding: "0.72rem 1.75rem",
                fontSize: "0.85rem",
                fontFamily: "'Public Sans', sans-serif",
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
        <div style={{ padding: "1rem 1.5rem 0", display: "flex", justifyContent: "center" }}>
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
