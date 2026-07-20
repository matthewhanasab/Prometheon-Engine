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
function Brand({ width = 140 }: { width?: number }) {
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

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: dir === "right" ? "rotate(180deg)" : "none", display: "block" }}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

const TOGGLE_BTN: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 999, flexShrink: 0, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  background: "var(--bg-elevated)", border: "1px solid var(--border)",
  color: "var(--text-secondary)",
};

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);          // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop sidebar hidden
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Restore the saved collapse preference
  useEffect(() => {
    try { if (localStorage.getItem("sidebar_collapsed") === "1") setCollapsed(true); } catch { /* ignore */ }
  }, []);

  const onLanding = pathname === "/";

  // Tell the layout which fixed brand element is present so the content column
  // pads itself underneath it (rules live in layout.tsx).
  useEffect(() => {
    const el = document.documentElement;
    delete el.dataset.sidebar;
    delete el.dataset.topbar;
    if (onLanding) return;
    if (isMobile) el.dataset.topbar = "mobile";
    else if (collapsed) el.dataset.sidebar = "collapsed";
    return () => { delete el.dataset.sidebar; delete el.dataset.topbar; };
  }, [isMobile, collapsed, onLanding]);

  function setCollapsedPersist(v: boolean) {
    setCollapsed(v);
    try { localStorage.setItem("sidebar_collapsed", v ? "1" : "0"); } catch { /* ignore */ }
  }

  const handleNav = () => { if (isMobile) setOpen(false); };

  // Landing page is full-bleed — no chrome at all
  if (onLanding) return null;

  const navLinks = (
    <nav style={{ flex: 1 }}>
      {NAV.map(({ href, label }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link key={href} href={href} onClick={handleNav} style={{
            display: "block",
            padding: "0.75rem 1.75rem",
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
  );

  // ── Mobile: fixed top bar (hamburger + wordmark) + slide-in drawer ─────────
  if (isMobile) {
    return (
      <>
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 52, zIndex: 140,
          display: "flex", alignItems: "center", gap: 12, padding: "0 14px",
          background: "var(--bg-primary)", borderBottom: "1px solid var(--border)",
        }}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="Toggle menu"
            style={{
              width: 36, height: 36, borderRadius: 999, cursor: "pointer", flexShrink: 0,
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4, padding: 0,
            }}
          >
            {open ? (
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                <line x1="2" y1="2" x2="16" y2="16" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round"/>
                <line x1="16" y1="2" x2="2" y2="16" stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            ) : (
              <>
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
              </>
            )}
          </button>
          <Link href="/" onClick={handleNav} style={{ display: "flex", alignItems: "center" }}>
            <Brand width={116} />
          </Link>
        </div>

        {open && (
          <div onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.5)" }} />
        )}

        <aside style={{
          width: 220, minWidth: 220,
          background: "var(--bg-primary)",
          borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          padding: "1.25rem 0 2rem",
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 160,
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
          boxShadow: open ? "4px 0 24px rgba(0,0,0,0.4)" : "none",
        }}>
          <div style={{ padding: "0 1.5rem 1.1rem" }}>
            <Link href="/" onClick={handleNav} style={{ display: "block" }}>
              <Brand width={150} />
            </Link>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", marginBottom: "1.25rem" }} />
          {navLinks}
          <div style={{ padding: "1rem 1.5rem 0", display: "flex", justifyContent: "center" }}>
            <ThemeToggle />
          </div>
        </aside>
      </>
    );
  }

  // ── Desktop collapsed: brand stays as a fixed corner tab ──────────────────
  if (collapsed) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, zIndex: 140,
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px 12px 16px",
        background: "var(--bg-primary)",
        borderRight: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        borderBottomRightRadius: 18,
      }}>
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <Brand width={132} />
        </Link>
        <button aria-label="Show navigation" title="Show navigation"
          onClick={() => setCollapsedPersist(false)} style={TOGGLE_BTN}>
          <Chevron dir="right" />
        </button>
      </div>
    );
  }

  // ── Desktop expanded ───────────────────────────────────────────────────────
  return (
    <aside style={{
      width: 220, minWidth: 220, height: "100%",
      background: "var(--bg-primary)",
      borderRight: "1px solid var(--border)",
      display: "flex", flexDirection: "column",
      overflowY: "auto",
      padding: "1.25rem 0 2rem",
    }}>
      <div style={{ padding: "0 0.9rem 1.05rem 1.4rem", display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
          <Brand width={142} />
        </Link>
        <button aria-label="Hide navigation" title="Hide navigation"
          onClick={() => setCollapsedPersist(true)} style={TOGGLE_BTN}>
          <Chevron dir="left" />
        </button>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", marginBottom: "1.25rem" }} />
      {navLinks}
      <div style={{ padding: "1rem 1.5rem 0", display: "flex", justifyContent: "center" }}>
        <ThemeToggle />
      </div>
    </aside>
  );
}
