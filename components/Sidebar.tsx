"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import ThemeToggle from "@/components/ThemeToggle";

// Flat list — used by the mobile drawer
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
  { href: "/ms",            label: "Market Stack" },
];

// Desktop top bar: direct tabs + grouped dropdowns (1000x-style)
const DIRECT = [
  { href: "/research",  label: "Research" },
  { href: "/compare",   label: "Compare" },
  { href: "/charts",    label: "Charts" },
  { href: "/etf",       label: "ETFs" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/ms",        label: "Market Stack" },
];
const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "Analysis",
    items: [
      { href: "/fairvalue",   label: "Fair Value Graph" },
      { href: "/financials",  label: "Financials" },
      { href: "/projections", label: "Projections" },
      { href: "/earnings",    label: "Earnings" },
      { href: "/dividends",   label: "Dividends" },
      { href: "/screener",    label: "Screener" },
    ],
  },
  {
    label: "Options",
    items: [
      { href: "/covered-calls", label: "Covered Calls" },
      { href: "/puts",          label: "Cash-Secured Puts" },
    ],
  },
  {
    label: "Smart Money",
    items: [
      { href: "/congress", label: "Congress Trades" },
      { href: "/insider",  label: "Insider Trading" },
      { href: "/sec",      label: "SEC Filings" },
    ],
  },
  {
    label: "More",
    items: [
      { href: "/macro",      label: "Macro Dashboard" },
      { href: "/movers",     label: "Market Movers" },
      { href: "/calculator", label: "Compound Calculator" },
    ],
  },
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

function Caret({ up }: { up?: boolean }) {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", marginLeft: 5, transform: up ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center",
  padding: "8px 11px", borderRadius: 10, whiteSpace: "nowrap",
  fontFamily: "'Public Sans', sans-serif", fontSize: "0.7rem", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.09em", textDecoration: "none",
  color: active ? "var(--accent-gold)" : "var(--text-secondary)",
  background: active ? "var(--bg-elevated)" : "transparent",
  border: "none", cursor: "pointer",
});

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);            // mobile drawer
  const [menu, setMenu] = useState<string | null>(null); // desktop dropdown
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const onLanding = pathname === "/";

  // Content pads itself under the fixed bar (rule lives in layout.tsx)
  useEffect(() => {
    const el = document.documentElement;
    if (onLanding) { delete el.dataset.topbar; return; }
    el.dataset.topbar = "1";
    return () => { delete el.dataset.topbar; };
  }, [onLanding]);

  // Close everything on navigation / Escape
  useEffect(() => { setOpen(false); setMenu(null); }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setMenu(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (onLanding) return null;

  const isActive = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href));

  // ── Market Stack mirror mode ─────────────────────────────────────────────
  // Under /ms the ENTIRE nav points at the mirrored site: every href becomes
  // /ms/<page>. Ported pages render for real; the rest hit the /ms catch-all,
  // which explains what marketstack can't provide. The "Market Stack" tab
  // becomes "FMP Site" so there is always one exit back.
  const inMs = pathname === "/ms" || pathname.startsWith("/ms/");
  const mirror = (items: { href: string; label: string }[]) =>
    items.map((it) =>
      !inMs ? it
      : it.href === "/ms" ? { href: "/research", label: "FMP Site" }
      : { href: `/ms${it.href}`, label: it.label }
    );

  // ── Mobile: logo top-left, hamburger top-right, right-side drawer ──────────
  if (isMobile) {
    return (
      <>
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 210,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px",
          background: "var(--bg-primary)", borderBottom: "1px solid var(--border)",
        }}>
          <Link href={inMs ? "/ms" : "/"} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Brand width={128} />
            {inMs && (
              <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--on-accent)", background: "var(--accent-gold)", borderRadius: 999, padding: "2px 7px" }}>
                MS
              </span>
            )}
          </Link>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            style={{
              width: 38, height: 38, borderRadius: 999, cursor: "pointer", flexShrink: 0,
              background: open ? "var(--accent-gold)" : "var(--bg-elevated)",
              border: "1px solid var(--border)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 4, padding: 0,
            }}
          >
            {open ? (
              <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
                <line x1="2" y1="2" x2="16" y2="16" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="16" y1="2" x2="2" y2="16" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round"/>
              </svg>
            ) : (
              <>
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
                <span style={{ width: 16, height: 2, background: "var(--text-primary)", borderRadius: 999 }} />
              </>
            )}
          </button>
        </div>

        {open && (
          <div onClick={() => setOpen(false)} aria-hidden style={{
            position: "fixed", left: 0, right: 0, top: 56, bottom: 0, zIndex: 195,
            background: "rgba(0,0,0,0.45)",
          }} />
        )}

        <aside style={{
          position: "fixed", top: 56, right: 0, bottom: 0, zIndex: 200,
          width: 250, background: "var(--bg-primary)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          padding: "0.9rem 0 1.5rem",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease",
          boxShadow: open ? "-6px 0 28px rgba(0,0,0,0.35)" : "none",
        }}>
          <nav style={{ flex: 1 }}>
            {mirror(NAV).map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)} style={{
                  display: "block",
                  padding: "0.72rem 1.6rem",
                  fontSize: "0.85rem",
                  fontFamily: "'Public Sans', sans-serif",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  borderRight: active ? "3px solid var(--accent-gold)" : "3px solid transparent",
                  background: active ? "var(--bg-elevated)" : "transparent",
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

  // ── Desktop: 1000x-style top bar — big logo left, tabs across the top ─────
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: 72, zIndex: 210,
      display: "flex", alignItems: "center",
      padding: "0 20px",
      background: "var(--bg-primary)", borderBottom: "1px solid var(--border)",
    }}>
      <Link href={inMs ? "/ms" : "/"} style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <Brand width={182} />
        {inMs && (
          <span style={{ fontFamily: "'Public Sans', sans-serif", fontSize: "0.54rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--on-accent)", background: "var(--accent-gold)", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>
            Market Stack
          </span>
        )}
      </Link>

      {/* breathing room + divider between brand and tabs */}
      <div style={{ width: 1, height: 34, background: "var(--border)", margin: "0 18px 0 22px", flexShrink: 0 }} />

      <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
        {mirror(DIRECT).map(({ href, label }) => (
          <Link key={href} href={href} className="topnav-link" style={TAB_STYLE(isActive(href))}>
            {label}
          </Link>
        ))}

        {GROUPS.map((g) => {
          const groupActive = mirror(g.items).some((it) => isActive(it.href));
          const openMenu = menu === g.label;
          return (
            <div key={g.label} style={{ position: "relative" }}
              onMouseEnter={() => setMenu(g.label)}
              onMouseLeave={() => setMenu(null)}>
              <button
                type="button"
                className="topnav-link"
                aria-expanded={openMenu}
                aria-haspopup="true"
                onClick={() => setMenu(openMenu ? null : g.label)}
                style={TAB_STYLE(groupActive)}
              >
                {g.label}
                <Caret up={openMenu} />
              </button>
              {openMenu && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, paddingTop: 6, zIndex: 220,
                }}>
                  <div style={{
                    minWidth: 198,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    borderRadius: 14, padding: 6,
                    boxShadow: "0 14px 34px rgba(0,0,0,0.28)",
                  }}>
                    {mirror(g.items).map((it) => {
                      const active = isActive(it.href);
                      return (
                        <Link key={it.href} href={it.href} onClick={() => setMenu(null)} style={{
                          display: "block", padding: "9px 12px", borderRadius: 9,
                          fontFamily: "'Public Sans', sans-serif", fontSize: "0.8rem",
                          fontWeight: active ? 600 : 400,
                          color: active ? "var(--accent-gold)" : "var(--text-secondary)",
                          background: active ? "var(--bg-elevated)" : "transparent",
                          textDecoration: "none", whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
                        >
                          {it.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{ flexShrink: 0, marginLeft: 12 }}>
        <ThemeToggle />
      </div>
    </div>
  );
}
