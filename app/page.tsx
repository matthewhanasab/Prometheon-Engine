"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

// ── Launch button with ignition animation ────────────────────────────────────
function LaunchButton({ children, onLaunch, variant = "solid" }: {
  children: React.ReactNode; onLaunch: () => void; variant?: "solid" | "outline";
}) {
  const solid = variant === "solid";
  return (
    <button onClick={onLaunch} style={{
      background: solid ? "var(--accent-gold)" : "transparent",
      color: solid ? "var(--on-accent)" : "var(--accent-gold)",
      border: solid ? "none" : "1.5px solid var(--accent-gold)",
      cursor: "pointer",
      padding: "14px 34px", borderRadius: 22, fontSize: "0.78rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Public Sans', sans-serif",
    }}>
      {children}
    </button>
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

    function resize() {
      if (!canvas) return;
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const accentRgb = (getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb") || "59, 110, 235").trim();
    const N = 80;
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

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}

// ── Live market ticker tape ───────────────────────────────────────────────────
interface MarketQuote { symbol: string; name?: string; price: number; changePct: number | null; }

function TickerTape() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);

  useEffect(() => {
    fetch("/api/macro")
      .then(r => r.json())
      .then(d => {
        const mk = (d?.markets ?? []).filter((m: any) => m?.price != null);
        setQuotes(mk);
      })
      .catch(() => {});
  }, []);

  if (quotes.length === 0) return null;
  const items = [...quotes, ...quotes, ...quotes, ...quotes]; // repeat for seamless loop

  return (
    <div style={{ overflow: "hidden", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", padding: "10px 0" }}>
      <div className="ticker-track">
        {items.map((q, i) => (
          <span key={i} style={{ display: "inline-flex", gap: 10, alignItems: "baseline", padding: "0 2rem", whiteSpace: "nowrap", fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.78rem" }}>
            <span style={{ color: "var(--accent-gold)", fontWeight: 600 }}>{q.symbol}</span>
            <span style={{ color: "var(--text-primary)" }}>${q.price.toFixed(2)}</span>
            {q.changePct != null && (
              <span style={{ color: q.changePct >= 0 ? "var(--positive)" : "var(--negative)" }}>
                {q.changePct >= 0 ? "+" : ""}{q.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Live scaled preview of an app page ────────────────────────────────────────
function LivePreview({ href }: { href: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  // Keep the embedded page's theme in lockstep with the parent (same-origin)
  useEffect(() => {
    function sync() {
      try {
        const doc = frameRef.current?.contentDocument;
        if (doc?.documentElement) {
          doc.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
        }
      } catch { /* frame not ready */ }
    }
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const frame = frameRef.current;
    frame?.addEventListener("load", sync);
    return () => { obs.disconnect(); frame?.removeEventListener("load", sync); };
  }, []);

  return (
    <div style={{
      position: "relative", height: 280, overflow: "hidden", borderRadius: 22,
      border: "1px solid var(--border-active)", background: "var(--bg-primary)",
      boxShadow: "0 0 24px rgba(var(--accent-rgb), 0.10)",
    }}>
      <iframe
        ref={frameRef}
        src={href}
        loading="lazy"
        scrolling="no"
        style={{
          width: 1500, height: 1500, border: "none",
          transform: "scale(0.335)", transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

const SHOWCASE = [
  { href: "/portfolio?demo=1", title: "My Portfolio",         desc: "Track your real positions — live P/L, allocation, dividend income, and a benchmark race against the S&P 500." },
  { href: "/research?ticker=AAPL", title: "Stock Research",       desc: "Type a ticker, get the full picture — valuation, growth, quality, analyst consensus, insiders, and institutions on one page." },
  { href: "/macro",         title: "Macro Dashboard",      desc: "Rates, inflation, the yield curve, and fear & greed — know the market backdrop before you buy anything." },
  { href: "/earnings?week=2026-07-27", title: "Earnings Calendar",    desc: "Who reports this week, before the bell and after the close. Click any ticker to research it instantly." },
  { href: "/screener",      title: "Screener",             desc: "Filter the entire market by sector, size, valuation, and profitability — then jump straight into research." },
  { href: "/charts?ticker=NVDA", title: "Financial Charts",     desc: "Quarterly revenue, margins, EPS, and cash flow — with analyst forecasts drawn right on the chart." },
  { href: "/compare?t=AAPL,MSFT", title: "Compare Stocks",       desc: "Up to four tickers side by side across valuation, growth, profitability, and health — with a radar chart." },
  { href: "/financials?ticker=MSFT", title: "Financial Statements", desc: "Income statement, balance sheet, and cash flow — annual and quarterly, with YoY change highlighting." },
  { href: "/projections?ticker=AMD", title: "Projections",          desc: "Bull, base, and bear five-year scenarios with editable growth and multiple assumptions." },
  { href: "/covered-calls?ticker=TSLA", title: "Covered Calls",        desc: "Estimate option premium income with a strike-by-strike comparison table." },
  { href: "/calculator",    title: "Compound Calculator",  desc: "See what consistent investing does over decades, across low, base, and high return scenarios." },
  { href: "/sec?ticker=AAPL", title: "SEC Filings",          desc: "10-Ks, 10-Qs, and 8-Ks straight from EDGAR, one click from the source." },
  { href: "/congress",      title: "Congress Trades",      desc: "Every stock trade disclosed by U.S. Senators and Representatives — who bought, who sold, and how late they told you." },
  { href: "/insider",       title: "Insider Trading",      desc: "SEC Form 4 filings in real time — when a CEO buys their own stock with their own money, you'll see it here first." },
  { href: "/movers",        title: "Market Movers",        desc: "Today's biggest gainers, losers, and most active names, plus a sector heatmap of where the money is rotating." },
  { href: "/dividends?ticker=KO", title: "Dividend Hub",         desc: "Payment history, yield, growth streaks, and 5-year dividend CAGR — plus the full ex-dividend calendar." },
];

// ── Feature grid ──────────────────────────────────────────────────────────────
const FEATURES = [
  { href: "/research?ticker=AAPL", title: "Stock Research",       desc: "40+ metrics, analyst consensus, insider and institutional activity — one page per ticker." },
  { href: "/charts?ticker=NVDA", title: "Financial Charts",     desc: "Quarterly revenue, margins, EPS, FCF and analyst forecasts, visualized." },
  { href: "/compare?t=AAPL,MSFT", title: "Compare Stocks",       desc: "Up to four tickers side by side across valuation, growth, and health." },
  { href: "/screener",      title: "Screener",             desc: "Filter the market by sector, size, valuation, and profitability." },
  { href: "/financials?ticker=MSFT", title: "Financial Statements", desc: "Income, balance sheet, and cash flow — annual and quarterly, with YoY change." },
  { href: "/projections?ticker=AMD", title: "Projections",          desc: "Bull, base, and bear five-year scenarios with editable assumptions." },
  { href: "/covered-calls?ticker=TSLA", title: "Covered Calls",        desc: "Premium income calculator with strike comparison tables." },
  { href: "/earnings?week=2026-07-27", title: "Earnings Calendar",    desc: "Who reports this week — before the bell and after the close." },
  { href: "/macro",         title: "Macro Dashboard",      desc: "Rates, inflation, yield curve, fear and greed — the full market backdrop." },
  { href: "/sec?ticker=AAPL", title: "SEC Filings",          desc: "10-Ks, 10-Qs, and 8-Ks straight from EDGAR." },
  { href: "/congress",      title: "Congress Trades",      desc: "Senate and House stock disclosures — trades, amounts, and disclosure lag." },
  { href: "/insider",       title: "Insider Trading",      desc: "Form 4 filings — executive and director buys, sales, and awards, valued and flagged." },
  { href: "/movers",        title: "Market Movers",        desc: "Top gainers, losers, most active, and a live sector heatmap." },
  { href: "/dividends?ticker=KO", title: "Dividend Hub",         desc: "Dividend history, yield, growth, and the ex-dividend calendar." },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  function launch(dest: string = "/research") {
    if (leaving) return;
    setLeaving(true);
    router.prefetch(dest);
    setTimeout(() => router.push(dest), 500);
  }

  return (
    <div className="landing" style={{
      fontFamily: "'Public Sans', sans-serif", color: "var(--text-primary)",
      opacity: leaving ? 0 : 1, transition: "opacity 0.5s ease",
    }}>

      <ThemeToggle floating />

      {/* ── Hero ── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "4rem 1.5rem 3rem", overflow: "hidden" }}>
        <Constellation />

        <div className="fade-up" style={{ position: "relative" }}>
          <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={560} height={180} priority
            style={{ objectFit: "contain", maxWidth: "88vw", height: "auto" }} />
          <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={560} height={180} priority
            style={{ objectFit: "contain", maxWidth: "88vw", height: "auto" }} />
        </div> <h1 className="fade-up fade-d1" style={{ position: "relative", fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "clamp(1.4rem, 3vw, 2.1rem)", fontWeight: 500, letterSpacing: "-0.02em", margin: "2rem 0 2.4rem", maxWidth: 760 }}>
          Every number that matters. One software.
        </h1>

        <div className="fade-up fade-d3" style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <LaunchButton onLaunch={() => launch("/research")}>Launch the Engine</LaunchButton>
        </div>

        {/* Stat chips */}
        <div className="fade-up fade-d4" style={{ position: "relative", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: "3rem" }}>
          {[["10", "Research Tools"], ["40+", "Metrics per Stock"], ["Live", "Market Data"]].map(([num, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "8px 18px" }}>
              <span style={{ fontFamily: "'Spline Sans Mono', monospace", fontWeight: 700, color: "var(--accent-gold)", fontSize: "0.95rem" }}>{num}</span>
              <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live ticker ── */}
      <TickerTape />

      {/* ── Features ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "4.5rem 1.5rem 3rem" }}>
        <h2 style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.4rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem", textAlign: "center" }}>
          The full research stack
        </h2>
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 260, margin: "0 auto 2.6rem" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="feature-card" style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
              padding: "20px 20px 18px", textDecoration: "none", display: "block",
            }}>
              <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "0.98rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                {f.title}
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {f.desc}
              </div>
              <div style={{ marginTop: 12, fontFamily: "'Spline Sans Mono', monospace", fontSize: "0.68rem", color: "var(--accent-gold)" }}>
                Open →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ textAlign: "center", padding: "3rem 1.5rem 5rem" }}>
        <div style={{ fontFamily: "'Space Grotesk', Georgia, serif", fontSize: "1.15rem", color: "var(--text-primary)", marginBottom: "1.4rem" }}>
          Stop tab-hopping. Start researching.
        </div>
        <LaunchButton onLaunch={() => launch("/research")}>Launch the Engine</LaunchButton>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "1.4rem", textAlign: "center", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Prometheon Engine · Market data for research purposes · Not financial advice
      </footer>
    </div>
  );
}
