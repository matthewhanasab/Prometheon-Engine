"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import Icon from "@/components/Icon";
import { useModKey } from "@/components/CommandMenu";
import { NAV_GROUPS, GITHUB_URL } from "@/lib/nav";

// ── Launch control ───────────────────────────────────────────────────────────
// A real link, so it can be opened in a new tab and followed by crawlers; a
// plain click plays the short fade first.
function LaunchButton({ children, href, onLaunch }: {
  children: React.ReactNode; href: string; onLaunch: (e: React.MouseEvent) => void;
}) {
  return (
    <Link href={href} onClick={onLaunch} className="pressable" style={{
      display: "inline-flex", alignItems: "center", gap: 10,
      background: "var(--accent-gold)", color: "var(--on-accent)",
      padding: "14px 30px", borderRadius: 999, fontSize: "0.9rem", fontWeight: 700,
      fontFamily: "'Public Sans', sans-serif", textDecoration: "none",
    }}>
      {children}
      <Icon name="arrow-right" size={16} strokeWidth={2.2} />
    </Link>
  );
}

// ── Particle constellation background ────────────────────────────────────────
function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0, h = 0;
    let visible = true;
    // Movement is decoration here; a visitor who has asked for less of it gets
    // the same field, drawn once and left still.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.a11yMotion === "reduce";

    function resize() {
      if (!canvas || !ctx) return;
      // Sized in device pixels (capped at 2x) so the lines stay crisp on a
      // phone or a retina display instead of being scaled up and blurred.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const accentRgb = (getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb") || "59, 110, 235").trim();
    // Fewer points on a phone: the field is as dense, and there are far fewer
    // pairs to test each frame.
    const N = w < 640 ? 44 : 80;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.00035,
      vy: (Math.random() - 0.5) * 0.00035,
      r: Math.random() * 1.6 + 0.6,
    }));

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);

      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      }

      // lines
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (pts[i].x - pts[j].x) * w;
          const dy = (pts[i].y - pts[j].y) * h;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            const a = (1 - d / 130) * 0.28;
            ctx.strokeStyle = `rgba(${accentRgb}, ${a})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(pts[i].x * w, pts[i].y * h);
            ctx.lineTo(pts[j].x * w, pts[j].y * h);
            ctx.stroke();
          }
        }
      }

      // dots
      for (const p of pts) {
        ctx.fillStyle = `rgba(${accentRgb}, 0.55)`;
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!still && visible) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Nothing is drawn while the hero is scrolled away or the tab is hidden.
    const wake = () => { cancelAnimationFrame(raf); if (!still && visible && !document.hidden) raf = requestAnimationFrame(frame); };
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
    io.observe(canvas);
    document.addEventListener("visibilitychange", wake);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

// ── Live scaled preview of an app page ────────────────────────────────────────
// ── Feature grid ──────────────────────────────────────────────────────────────
// Every tool on the site, grouped the way the navigation groups them. Each
// links to a worked example where the page takes a ticker.
const FEATURE_GROUPS = [
  { label: "Research", items: [
    { href: "/research?ticker=AAPL",   title: "Stock Research",       desc: "Valuation, growth, quality, analyst consensus, insiders and ownership, one page per company." },
    { href: "/compare?t=AAPL,MSFT",    title: "Compare Stocks",       desc: "Up to five companies side by side across valuation, growth and balance-sheet health." },
    { href: "/charts?ticker=NVDA",     title: "Financial Charts",     desc: "Revenue, margins, earnings and cash flow by quarter, drawn from the filings." },
    { href: "/financials?ticker=MSFT", title: "Financial Statements", desc: "Income statement, balance sheet and cash flow, annual and quarterly." },
  ]},
  { label: "Markets", items: [
    { href: "/earnings", title: "Earnings Calendar", desc: "Who reports this week, before the open or after the close, and what is expected." },
    { href: "/screener", title: "Screener",          desc: "Filter the whole market by sector, size, valuation and profitability." },
    { href: "/movers",   title: "Market Movers",     desc: "Today's gainers, losers and most active, with a map of the S&P 500." },
    { href: "/macro",    title: "Macro Dashboard",   desc: "Rates, inflation, the yield curve and sentiment: the backdrop for every stock." },
  ]},
  { label: "Funds & Options", items: [
    { href: "/etf?ticker=VOO",              title: "ETF Hub",                 desc: "What a fund holds, where, what it yields and what it costs." },
    { href: "/etf/compare?t=VOO,QQQ",       title: "Compare ETFs",            desc: "Returns, concentration and how much two funds actually hold in common." },
    { href: "/options-chain?ticker=AAPL",   title: "Options Chain",           desc: "Quotes, implied volatility and Greeks for every listed contract." },
    { href: "/covered-calls?ticker=TSLA",   title: "Covered Call Calculator", desc: "Premium income on shares you hold, ranked strike by strike." },
  ]},
  { label: "Smart Money", items: [
    { href: "/mna",      title: "M&A Activity",    desc: "Acquisitions, buyouts and IPOs by industry: acquirer, target, value and advisers." },
    { href: "/congress", title: "Congress Trades", desc: "Every stock trade disclosed by U.S. Senators and Representatives." },
    { href: "/insider",  title: "Insider Trading", desc: "Form 4 filings: what executives and directors buy and sell." },
    { href: "/sec",      title: "SEC Filings",     desc: "10-Ks, 10-Qs and 8-Ks, each linked to the original on EDGAR." },
  ]},
  { label: "Planning", items: [
    { href: "/projections?ticker=AMD", title: "Projections",         desc: "Bull, base and bear five-year scenarios with assumptions you can edit." },
    { href: "/dividends?ticker=KO",    title: "Dividends",           desc: "Payment history, yield, growth streak and the next ex-dividend date." },
    { href: "/calculator",             title: "Compound Calculator", desc: "What steady investing does over decades, under three return scenarios." },
  ]},
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const mod = useModKey();

  // A plain click fades the page out before the route changes. Modified
  // clicks (new tab, new window) are left to the browser.
  function launch(e: React.MouseEvent, dest: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (leaving) return;
    setLeaving(true);
    router.prefetch(dest);
    setTimeout(() => router.push(dest), 220);
  }

  return (
    <div className="landing" style={{
      fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)",
      opacity: leaving ? 0 : 1, transition: "opacity 0.22s ease",
    }}>

      <ThemeToggle floating />

      {/* ── Hero ── */}
      <section style={{ position: "relative", minHeight: "100svh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "4rem 1.5rem 3rem", overflow: "hidden" }}>
        <Constellation />

        <div className="fade-up" style={{ position: "relative" }}>
          <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={560} height={180} priority
            style={{ objectFit: "contain", maxWidth: "88vw", height: "auto" }} />
          <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={560} height={180} priority
            style={{ objectFit: "contain", maxWidth: "88vw", height: "auto" }} />
        </div> <h1 className="fade-up fade-d1" style={{ position: "relative", fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "clamp(1.4rem, 3vw, 2.1rem)", fontWeight: 500, letterSpacing: "-0.02em", margin: "2rem 0 2.4rem", maxWidth: 760 }}>
          Every number that matters. One software.
        </h1>

        <div className="fade-up fade-d2" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
          <LaunchButton href="/research" onLaunch={(e) => launch(e, "/research")}>Launch the Engine</LaunchButton>
          <button type="button" onClick={() => window.dispatchEvent(new Event("prometheon:search"))} style={{
            display: "inline-flex", alignItems: "center", gap: 8, minHeight: 40, padding: "0 14px", cursor: "pointer",
            background: "transparent", border: "none", color: "var(--text-secondary)",
            fontFamily: "'Public Sans', sans-serif", fontSize: "0.85rem",
          }}>
            <Icon name="search" size={15} />
            Search a company or ticker
            <kbd className="kbd landing-kbd">{mod === "Ctrl" ? "Ctrl K" : "⌘K"}</kbd>
          </button>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "4.5rem 1.5rem 3rem" }}>
        <h2 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.4rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem", textAlign: "center" }}>
          The full research stack
        </h2>
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 260, margin: "0 auto 2.6rem" }} />

        {FEATURE_GROUPS.map((g) => (
          <div key={g.label} style={{ marginBottom: "2.2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {g.label}
              </div>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              {g.items.map((f) => (
                <Link key={f.href} href={f.href} className="feature-card" style={{
                  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
                  padding: "18px 20px 16px", textDecoration: "none", display: "flex", flexDirection: "column",
                }}>
                  <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "0.98rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    {f.title}
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.55, flex: 1 }}>
                    {f.desc}
                  </div>
                  <div style={{ marginTop: 12, fontSize: "0.76rem", fontWeight: 600, color: "var(--accent-gold)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    Open <Icon name="arrow-right" size={13} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ textAlign: "center", padding: "3rem 1.5rem 5rem" }}>
        <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.15rem", color: "var(--text-primary)", marginBottom: "1.4rem" }}>
          Stop tab-hopping. Start researching.
        </div>
        <LaunchButton href="/research" onLaunch={(e) => launch(e, "/research")}>Launch the Engine</LaunchButton>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "3.5rem max(1.5rem, env(safe-area-inset-right, 0px)) 2rem max(1.5rem, env(safe-area-inset-left, 0px))" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "2.25rem 2rem" }}>
          <div>
            <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={200} height={64}
              style={{ objectFit: "contain", height: "auto", marginBottom: "1rem" }} />
            <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={200} height={64}
              style={{ objectFit: "contain", height: "auto", marginBottom: "1rem" }} />
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 300, marginBottom: "1rem" }}>
              Professional-grade stock research, free for everyone.
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Made by Matthew Hanasab with <span className="heartbeat" aria-label="love" role="img">❤️</span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: "0.78rem", flexWrap: "wrap" }}>
              <Link href="/about" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>About</Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>Source on GitHub <Icon name="external" size={13} /></a>
            </div>
          </div>
          {NAV_GROUPS.map((col) => (
            <nav key={col.label} aria-label={col.label}>
              <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.6rem" }}>
                {col.label}
              </div>
              {col.items.map((l) => (
                <Link key={l.href} href={l.href} className="footer-link"
                  style={{ display: "flex", alignItems: "center", minHeight: 32, fontSize: "0.82rem", color: "var(--text-secondary)", textDecoration: "none" }}>
                  {l.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
        <div style={{ maxWidth: 1200, margin: "2.5rem auto 0", paddingTop: "1.2rem", borderTop: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-muted)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <span suppressHydrationWarning>© {new Date().getFullYear()}</span> Prometheon Engine. Market data for research, not financial advice.
        </div>
      </footer>
    </div>
  );
}
