"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Launch button with ignition animation ────────────────────────────────────
function LaunchButton({ children, onLaunch }: { children: React.ReactNode; onLaunch: () => void }) {
  return (
    <button onClick={onLaunch} style={{
      background: "var(--accent-gold)", color: "#131C2E", border: "none", cursor: "pointer",
      padding: "14px 34px", borderRadius: 4, fontSize: "0.78rem", fontWeight: 700,
      textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'IBM Plex Sans', sans-serif",
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
            ctx.strokeStyle = `rgba(212, 180, 94, ${a})`;
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
        ctx.fillStyle = "rgba(212, 180, 94, 0.55)";
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
          <span key={i} style={{ display: "inline-flex", gap: 10, alignItems: "baseline", padding: "0 2rem", whiteSpace: "nowrap", fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.78rem" }}>
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
  return (
    <div style={{
      position: "relative", height: 280, overflow: "hidden", borderRadius: 6,
      border: "1px solid rgba(212,180,94,0.45)", background: "var(--bg-primary)",
      boxShadow: "0 0 24px rgba(212,180,94,0.08)",
    }}>
      <iframe
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
  { href: "/puts?ticker=TSLA", title: "Cash-Secured Puts",    desc: "Get paid to wait for your entry price — every put strike scored for premium versus discount." },
  { href: "/calculator",    title: "Compound Calculator",  desc: "See what consistent investing does over decades, across low, base, and high return scenarios." },
  { href: "/sec?ticker=AAPL", title: "SEC Filings",          desc: "10-Ks, 10-Qs, and 8-Ks straight from EDGAR, one click from the source." },
  { href: "/congress",      title: "Congress Trades",      desc: "Every stock trade disclosed by U.S. Senators and Representatives — who bought, who sold, and how late they told you." },
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
  { href: "/puts?ticker=TSLA", title: "Cash-Secured Puts",    desc: "Get paid to wait for your entry price — put premiums scored strike by strike." },
  { href: "/earnings?week=2026-07-27", title: "Earnings Calendar",    desc: "Who reports this week — before the bell and after the close." },
  { href: "/macro",         title: "Macro Dashboard",      desc: "Rates, inflation, yield curve, fear and greed — the full market backdrop." },
  { href: "/sec?ticker=AAPL", title: "SEC Filings",          desc: "10-Ks, 10-Qs, and 8-Ks straight from EDGAR." },
  { href: "/congress",      title: "Congress Trades",      desc: "Senate and House stock disclosures — trades, amounts, and disclosure lag." },
  { href: "/movers",        title: "Market Movers",        desc: "Top gainers, losers, most active, and a live sector heatmap." },
  { href: "/dividends?ticker=KO", title: "Dividend Hub",         desc: "Dividend history, yield, growth, and the ex-dividend calendar." },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  function launch() {
    if (leaving) return;
    setLeaving(true);
    router.prefetch("/research");
    setTimeout(() => router.push("/research"), 500);
  }

  return (
    <div className="landing" style={{
      fontFamily: "'IBM Plex Sans', sans-serif", color: "var(--text-primary)",
      opacity: leaving ? 0 : 1, transition: "opacity 0.5s ease",
    }}>

      {/* ── Hero ── */}
      <section style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "4rem 1.5rem 3rem", overflow: "hidden" }}>
        <Constellation />

        <div className="fade-up" style={{ position: "relative" }}>
          <Image src="/logo_transparent.png" alt="Prometheon Engine" width={560} height={180} priority
            style={{ objectFit: "contain", maxWidth: "88vw", height: "auto" }} />
        </div>

        <h1 className="fade-up fade-d1" style={{ position: "relative", fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "clamp(1.4rem, 3vw, 2.1rem)", fontWeight: 500, letterSpacing: "-0.02em", margin: "2rem 0 2.4rem", maxWidth: 760 }}>
          Every number that matters. One software.
        </h1>

        <div className="fade-up fade-d3" style={{ position: "relative", display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <LaunchButton onLaunch={launch}>Launch the Engine</LaunchButton>
        </div>

        {/* Stat chips */}
        <div className="fade-up fade-d4" style={{ position: "relative", display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: "3rem" }}>
          {[["10", "Research Tools"], ["40+", "Metrics per Stock"], ["Live", "Market Data"]].map(([num, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 4, padding: "8px 18px" }}>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: "var(--accent-gold)", fontSize: "0.95rem" }}>{num}</span>
              <span style={{ fontSize: "0.62rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-secondary)", fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Live ticker ── */}
      <TickerTape />

      {/* ── How it works ── */}
      <section style={{ maxWidth: 1240, margin: "0 auto", padding: "4.5rem 1.5rem 1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(480px, 100%), 1fr))", gap: 18 }}>

          {/* Gold header card */}
          <div style={{
            background: "linear-gradient(120deg, #E8CB7A 0%, var(--accent-gold) 55%, #A8842E 100%)",
            borderRadius: 6, padding: "2.6rem 2.4rem", display: "flex",
            flexDirection: "column", justifyContent: "center", alignItems: "flex-start", gap: 20,
          }}>
            <h2 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "2rem", fontWeight: 600, color: "#131C2E", margin: 0, letterSpacing: "-0.02em" }}>
              How it works
            </h2>
            <p style={{ color: "#2A3550", fontSize: "0.88rem", lineHeight: 1.65, margin: 0, maxWidth: 420 }}>
              These aren&apos;t mockups — every panel below is the live application, rendered in
              miniature. Click any card to open the real thing.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <LaunchButton onLaunch={launch}>Launch the Engine</LaunchButton>
            </div>
          </div>

          {/* Live preview cards */}
          {SHOWCASE.map((s) => (
            <Link key={s.href} href={s.href} className="feature-card" style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 6,
              padding: "1.4rem", textDecoration: "none", display: "flex", flexDirection: "column", gap: 14,
            }}>
              <div>
                <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {s.desc}
                </div>
              </div>
              <LivePreview href={s.href} />
            </Link>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "4.5rem 1.5rem 3rem" }}>
        <h2 style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.4rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem", textAlign: "center" }}>
          The full research stack
        </h2>
        <div style={{ height: 1, background: "linear-gradient(to right, transparent, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 260, margin: "0 auto 2.6rem" }} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {FEATURES.map((f) => (
            <Link key={f.href} href={f.href} className="feature-card" style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 4,
              padding: "20px 20px 18px", textDecoration: "none", display: "block",
            }}>
              <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "0.98rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>
                {f.title}
              </div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {f.desc}
              </div>
              <div style={{ marginTop: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.68rem", color: "var(--accent-gold)" }}>
                Open →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ textAlign: "center", padding: "3rem 1.5rem 5rem" }}>
        <div style={{ fontFamily: "'IBM Plex Serif', Georgia, serif", fontSize: "1.15rem", color: "var(--text-primary)", marginBottom: "1.4rem" }}>
          Stop tab-hopping. Start researching.
        </div>
        <LaunchButton onLaunch={launch}>Launch the Engine</LaunchButton>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "1.4rem", textAlign: "center", fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
        Prometheon Engine · Market data for research purposes · Not financial advice
      </footer>
    </div>
  );
}
