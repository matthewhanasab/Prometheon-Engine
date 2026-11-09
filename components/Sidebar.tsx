"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import Icon from "@/components/Icon";
import { useModKey } from "@/components/CommandMenu";
import { NAV_GROUPS, TOP_DIRECT, TOP_MENUS, isActivePath } from "@/lib/nav";

// The site's navigation: a top bar with menus on wide screens, a bar and a
// slide-over drawer on narrow ones. Both are in the HTML and CSS picks one, so
// a phone never paints the desktop bar first and then swaps it.

const SANS = "'Public Sans', sans-serif";

// Full wordmark, theme-swapped. File names are misleading:
// logo_transparent_dark.png = dark navy text (needs a LIGHT backdrop),
// logo_transparent.png = white text (needs a DARK backdrop).
function Brand({ width = 180 }: { width?: number }) {
  const height = Math.round((width * 605) / 1953);
  const style: React.CSSProperties = { width, height, objectFit: "contain" };
  return (
    <>
      <Image src="/logo_transparent_dark.png" alt="Prometheon Engine" className="logo-on-light"
        width={width} height={height} style={style} loading="eager" />
      <Image src="/logo_transparent.png" alt="" aria-hidden className="logo-on-dark"
        width={width} height={height} style={style} loading="eager" />
    </>
  );
}

export const openSearch = () => window.dispatchEvent(new Event("prometheon:search"));

const tabStyle = (active: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "8px 12px", borderRadius: 999, whiteSpace: "nowrap",
  fontFamily: SANS, fontSize: "0.8rem", fontWeight: 600, textDecoration: "none",
  color: active ? "var(--accent-gold)" : "var(--text-secondary)",
  background: active ? "var(--bg-elevated)" : "transparent",
  border: "none", cursor: "pointer",
});

type Pt = { x: number; y: number };

// Is `p` inside the triangle a-b-c? Used for menu aim, below.
function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt) {
  const s = (p1: Pt, p2: Pt, p3: Pt) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function DesktopNav({ pathname }: { pathname: string }) {
  const mod = useModKey();
  const [menu, setMenu] = useState<string | null>(null);
  // Keyboard opens skip the entrance: an action repeated all day should not
  // make its user wait on an animation.
  const [instant, setInstant] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prevPt = useRef<Pt | null>(null);
  const curPt = useRef<Pt | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };

  const close = useCallback(() => { clear(); setMenu(null); }, []);
  useEffect(() => clear, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Menu aim. With a menu open, the pointer often cuts across a neighbouring
  // tab on its diagonal way down to an item. If it is travelling inside the
  // triangle between where it was and the open panel's top edge, the
  // neighbour waits a beat instead of stealing the menu.
  const enterTab = (label: string) => {
    clear();
    if (!menu || menu === label) { setInstant(false); setMenu(label); return; }
    const rect = panelRef.current?.getBoundingClientRect();
    const a = prevPt.current, p = curPt.current;
    const aiming = rect && a && p && p.y >= a.y &&
      inTriangle(p, { x: a.x, y: a.y - 2 }, { x: rect.left - 8, y: rect.top }, { x: rect.right + 8, y: rect.top });
    if (aiming) timer.current = setTimeout(() => { setInstant(true); setMenu(label); }, 220);
    else { setInstant(true); setMenu(label); }
  };
  // Leaving the bar closes after a short grace, so a slip past the panel's
  // edge is recoverable.
  const leaveBar = () => { clear(); timer.current = setTimeout(() => setMenu(null), 140); };

  const onMove = (e: React.MouseEvent) => {
    prevPt.current = curPt.current;
    curPt.current = { x: e.clientX, y: e.clientY };
  };

  const focusItem = (group: string, index: number) => {
    const items = document.querySelectorAll<HTMLElement>(`[data-menu="${CSS.escape(group)}"] a`);
    if (!items.length) return;
    items[(index + items.length) % items.length].focus();
  };

  return (
    <div className="app-bar nav-desktop" onMouseMove={onMove} style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "var(--topbar-h)", zIndex: 210,
      alignItems: "center",
      paddingLeft: "max(20px, env(safe-area-inset-left, 0px))",
      paddingRight: "max(20px, env(safe-area-inset-right, 0px))",
      borderBottom: "1px solid var(--border)",
    }}>
      <Link href="/" aria-label="Prometheon Engine home" style={{ display: "flex", alignItems: "center", flexShrink: 0, borderRadius: 8 }}>
        <Brand width={168} />
      </Link>

      <div aria-hidden style={{ width: 1, height: 30, background: "var(--border)", margin: "0 14px 0 18px", flexShrink: 0 }} />

      <nav aria-label="Main" onMouseLeave={leaveBar} onMouseEnter={clear}
        style={{ display: "flex", alignItems: "center", gap: 2, flex: 1, minWidth: 0 }}>
        {TOP_DIRECT.map(({ href, label }) => {
          const active = isActivePath(pathname, href);
          return (
            <Link key={href} href={href} className="topnav-link" aria-current={active ? "page" : undefined}
              onMouseEnter={() => { clear(); if (menu) timer.current = setTimeout(() => setMenu(null), 140); }}
              style={tabStyle(active)}>
              {label}
            </Link>
          );
        })}

        {TOP_MENUS.map((g) => {
          const groupActive = g.items.some((it) => isActivePath(pathname, it.href));
          const isOpen = menu === g.label;
          const id = `menu-${g.label.replace(/\W+/g, "-").toLowerCase()}`;
          return (
            <div key={g.label} style={{ position: "relative" }} onMouseEnter={() => enterTab(g.label)}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setMenu((m) => (m === g.label ? null : m)); }}>
              <button
                type="button"
                className="topnav-link"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => { clear(); setInstant(true); setMenu(isOpen ? null : g.label); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault(); setInstant(true); setMenu(g.label);
                    requestAnimationFrame(() => focusItem(g.label, 0));
                  }
                }}
                style={tabStyle(groupActive)}
              >
                {g.label}
                <Icon name="chevron-down" size={12} strokeWidth={2.4}
                  style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast) var(--ease-out)" }} />
              </button>
              {isOpen && (
                <div ref={panelRef} style={{ position: "absolute", top: "100%", left: 0, paddingTop: 8, zIndex: 220 }}>
                  <div id={id} data-menu={g.label} className={instant ? "menu-panel is-instant" : "menu-panel"} style={{
                    minWidth: 250, padding: 6,
                    background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 16,
                    boxShadow: "0 18px 40px -12px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.12)",
                  }}>
                    {g.items.map((it, i) => {
                      const active = isActivePath(pathname, it.href);
                      return (
                        <Link key={it.href} href={it.href} className="menu-link" aria-current={active ? "page" : undefined}
                          onClick={close}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowDown") { e.preventDefault(); focusItem(g.label, i + 1); }
                            if (e.key === "ArrowUp") { e.preventDefault(); focusItem(g.label, i - 1); }
                            if (e.key === "Escape") { (e.currentTarget.closest("[data-menu]")?.parentElement?.previousElementSibling as HTMLElement | null)?.focus(); }
                          }}
                          style={{
                            display: "block", padding: "9px 12px", borderRadius: 10, textDecoration: "none",
                            background: active ? "var(--bg-elevated)" : "transparent",
                          }}>
                          <span style={{ display: "block", fontFamily: SANS, fontSize: "0.82rem", fontWeight: 600, color: active ? "var(--accent-gold)" : "var(--text-primary)", whiteSpace: "nowrap" }}>
                            {it.label}
                          </span>
                          <span style={{ display: "block", fontFamily: SANS, fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 2, maxWidth: 270, lineHeight: 1.4 }}>
                            {it.hint}
                          </span>
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

      <button type="button" onClick={openSearch} className="search-trigger" aria-label="Search pages and companies" aria-keyshortcuts="Meta+K Control+K"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12,
          height: 36, padding: "0 10px 0 12px", cursor: "pointer",
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          color: "var(--text-secondary)", fontFamily: SANS, fontSize: "0.78rem",
        }}>
        <Icon name="search" size={15} />
        <span className="search-trigger-label">Search</span>
        <kbd className="kbd search-trigger-label">{mod === "Ctrl" ? "Ctrl K" : "⌘K"}</kbd>
      </button>

      <div style={{ flexShrink: 0, marginLeft: 12, display: "flex" }}>
        <ThemeToggle />
      </div>
    </div>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const drawer = useRef<HTMLElement | null>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; active: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the open drawer.
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); root.style.overflow = prev; };
  }, [open]);

  // Swipe to dismiss: the drawer follows the finger 1:1 and closes on a
  // rightward flick or once it is dragged a third of the way out. Vertical
  // movement stays with the list's own scrolling.
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || drag.current) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current, el = drawer.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      d.active = true;
      el.setPointerCapture(e.pointerId);
      el.style.transition = "none";
    }
    d.dx = Math.max(0, dx);
    el.style.transform = `translateX(${d.dx}px)`;
  };
  const onPointerEnd = () => {
    const d = drag.current, el = drawer.current;
    drag.current = null;
    if (!d || !el || !d.active) return;
    const velocity = d.dx / Math.max(1, performance.now() - d.t);
    el.style.transition = "";
    el.style.transform = "";
    if (d.dx > el.offsetWidth * 0.33 || velocity > 0.45) setOpen(false);
  };

  return (
    <>
      <div className="app-bar nav-mobile" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 210,
        height: "calc(var(--topbar-h) + env(safe-area-inset-top, 0px))",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingLeft: "max(12px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(8px, env(safe-area-inset-right, 0px))",
        alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
      }}>
        <Link href="/" aria-label="Prometheon Engine home" style={{ display: "flex", alignItems: "center", minHeight: 44 }}>
          <Brand width={128} />
        </Link>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button type="button" onClick={openSearch} aria-label="Search pages and companies" style={{
            width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer",
          }}>
            <Icon name="search" size={20} />
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-drawer"
            style={{
              width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer",
            }}>
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        </div>
      </div>

      <div className="nav-mobile-layer drawer-scrim" data-open={open} onClick={() => setOpen(false)} aria-hidden />

      <aside id="mobile-drawer" ref={drawer} className="nav-mobile-layer drawer" data-open={open} inert={!open}
        aria-label="Menu"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
        <nav aria-label="All pages" style={{ flex: 1 }}>
          {NAV_GROUPS.map((g) => (
            <div key={g.label} style={{ marginBottom: 14 }}>
              <div style={{
                padding: "8px 20px 6px", fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-muted)",
              }}>
                {g.label}
              </div>
              {g.items.map(({ href, label }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
                    style={{
                      display: "flex", alignItems: "center", minHeight: 44, margin: "0 8px", padding: "0 12px", borderRadius: 12,
                      fontFamily: SANS, fontSize: "0.95rem", fontWeight: active ? 600 : 500, textDecoration: "none",
                      color: active ? "var(--accent-gold)" : "var(--text-primary)",
                      background: active ? "var(--bg-elevated)" : "transparent",
                    }}>
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div style={{ margin: "4px 8px 0", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event("prometheon:a11y")); }}
            style={{
              display: "flex", alignItems: "center", width: "100%", minHeight: 44, padding: "0 12px",
              background: "transparent", border: "none", cursor: "pointer", textAlign: "left",
              fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)",
            }}>
            Display and accessibility options
          </button>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, padding: "0 12px",
            fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)",
          }}>
            Dark mode
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  // The landing page is its own full-bleed surface with a floating toggle.
  if (pathname === "/") return null;
  return (
    <header>
      <DesktopNav key={`d${pathname}`} pathname={pathname} />
      <MobileNav key={`m${pathname}`} pathname={pathname} />
    </header>
  );
}
