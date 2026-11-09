"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import TickerInput from "@/components/TickerInput";
import Icon from "@/components/Icon";
import { GITHUB_URL } from "@/lib/nav";
import { loadDirectory, searchDirectory } from "@/lib/tickerDirectory";

// The home page.
//
// It does one thing before anything else: takes a company and opens it. The
// search box is the hero, because looking a company up is what the product is
// for; the logo, the line and the Launch button are the brand's and stay.
//
// Behind them runs one real series, the S&P 500 fund's past year, in place of
// decoration: on a page that promises every number that matters, the
// background is a number too. Below, the tools are an index, set like the
// contents page of a journal, where every row is a link.

// The home page's display face. Schibsted Grotesk is a newspaper grotesque,
// sharp and compact, the journal half of the site's brief without a serif;
// figures and labels stay in Public Sans and the mono. The app pages keep
// Space Grotesk for their headings.
const DISPLAY = "'Schibsted Grotesk', 'Helvetica Neue', Arial, sans-serif";
const SANS = "'Public Sans', sans-serif";
const MONO = "'Spline Sans Mono', monospace";

const TRY = ["AAPL", "NVDA", "MSFT", "TSLA", "KO"];

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
  { label: "Funds and options", items: [
    { href: "/etf?ticker=VOO",              title: "ETF Hub",                 desc: "What a fund holds, where, what it yields and what it costs." },
    { href: "/etf/compare?t=VOO,QQQ",       title: "Compare ETFs",            desc: "Returns, concentration and how much two funds actually hold in common." },
    { href: "/options-chain?ticker=AAPL",   title: "Options Chain",           desc: "Quotes, implied volatility and Greeks for every listed contract." },
    { href: "/covered-calls?ticker=TSLA",   title: "Covered Call Calculator", desc: "Premium income on shares you hold, ranked strike by strike." },
  ]},
  { label: "Smart money", items: [
    { href: "/mna",      title: "M&A Activity",    desc: "Acquisitions, buyouts and IPOs by industry: acquirer, target, value and advisers." },
    { href: "/congress", title: "Congress Trades", desc: "Stock trades disclosed by members of Congress." },
    { href: "/insider",  title: "Insider Trading", desc: "Form 4 filings: what executives and directors buy and sell." },
    { href: "/sec",      title: "SEC Filings",     desc: "10-Ks, 10-Qs and 8-Ks, each linked to the original on EDGAR." },
  ]},
  { label: "Planning", items: [
    { href: "/projections?ticker=AMD", title: "Projections",         desc: "Bull, base and bear five-year scenarios with assumptions you can edit." },
    { href: "/dividends?ticker=KO",    title: "Dividends",           desc: "Payment history, yield, growth streak and the next ex-dividend date." },
    { href: "/calculator",             title: "Compound Calculator", desc: "What steady investing does over decades, under three return scenarios." },
  ]},
];
const TOOL_COUNT = FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0);

// ── The market line ──────────────────────────────────────────────────────────
// The S&P 500 fund's daily closes for the past year, as one thin line across
// the foot of the hero. The band keeps its height while the data loads, so
// nothing moves when it arrives; if it never arrives the hero is simply plain.
type Close = { date: string; close: number };

function MarketLine() {
  const [closes, setCloses] = useState<Close[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/option-history/SPY")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && Array.isArray(j?.closes) && j.closes.length > 30) setCloses((j.closes as Close[]).slice(-252)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const shape = useMemo(() => {
    if (!closes) return null;
    const v = closes.map((c) => c.close);
    const min = Math.min(...v), max = Math.max(...v);
    const span = max - min || 1;
    // 1000 wide by 100 tall, stretched to the band; the line keeps to the
    // middle 80% of the height so it never touches the edges.
    const pts = v.map((x, i) => [(i / (v.length - 1)) * 1000, 90 - ((x - min) / span) * 80] as const);
    const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(2)}`).join(" ");
    const first = v[0], last = v[v.length - 1];
    return { line, area: `${line} L1000 100 L0 100 Z`, change: (last - first) / first, last };
  }, [closes]);

  return (
    <div className="home-line" aria-hidden={!shape}>
      {shape && (
        <>
          <div className="home-line-plot" data-drawn="1" aria-hidden>
            <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ display: "block" }}>
              <path d={shape.area} fill="var(--accent-gold)" opacity={0.07} />
              <path d={shape.line} fill="none" stroke="var(--accent-gold)" strokeOpacity={0.6} strokeWidth={1.5}
                strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <p className="home-line-note" style={{
            position: "absolute", left: "max(1.5rem, env(safe-area-inset-left, 0px))", right: "max(1.5rem, env(safe-area-inset-right, 0px))", bottom: 14, margin: 0,
            display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 16px",
            fontFamily: SANS, fontSize: "0.75rem", color: "var(--text-muted)",
          }}>
            <span>The S&amp;P 500 fund (SPY), past 12 months</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 10, fontFamily: MONO, whiteSpace: "nowrap" }}>
              <span style={{ color: "var(--text-secondary)" }}>${shape.last.toFixed(2)}</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600, color: shape.change >= 0 ? "var(--positive)" : "var(--negative)" }}>
                <Icon name={shape.change >= 0 ? "tri-up" : "tri-down"} size="0.7em" filled style={{ verticalAlign: 0 }} />
                <span className="sr-only">{shape.change >= 0 ? "up" : "down"} </span>
                {Math.abs(shape.change * 100).toFixed(1)}%
              </span>
            </span>
          </p>
        </>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [draft, setDraft] = useState("");

  // Opening the app fades this page out first.
  const go = (dest: string) => {
    if (leaving) return;
    setLeaving(true);
    router.prefetch(dest);
    setTimeout(() => router.push(dest), 220);
  };
  const open = (ticker: string) => go(`/research?ticker=${encodeURIComponent(ticker)}`);

  // The button launches whatever is in the box: a symbol as typed, a company
  // name by its best match, and with the box empty, the app itself.
  const launch = async (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    const typed = draft.trim();
    if (!typed) return go("/research");
    // The directory puts an exact symbol first, then companies by name.
    const match = searchDirectory(await loadDirectory(), typed, 1)[0];
    if (match) return open(match[0]);
    return /^[A-Za-z]{1,5}([.-][A-Za-z])?$/.test(typed) ? open(typed.toUpperCase()) : go("/research");
  };

  return (
    <div className="landing" style={{
      fontFamily: SANS, color: "var(--text-primary)",
      opacity: leaving ? 0 : 1, transition: "opacity 0.22s ease",
    }}>
      <ThemeToggle floating />

      {/* ── Hero ── */}
      <section style={{ position: "relative", minHeight: "100svh", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "5rem 1.5rem 1.5rem",
        }}>
          <div className="fade-up">
            <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={560} height={180} priority
              style={{ objectFit: "contain", width: "min(440px, 80vw)", height: "auto" }} />
            <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={560} height={180} priority
              style={{ objectFit: "contain", width: "min(440px, 80vw)", height: "auto" }} />
          </div>

          <h1 className="fade-up fade-d1" style={{
            fontFamily: DISPLAY, fontSize: "clamp(1.8rem, 3.8vw, 2.7rem)", fontWeight: 500, letterSpacing: "-0.028em",
            lineHeight: 1.08, margin: "1.6rem 0 0", textWrap: "balance",
          }}>
            Every number that matters.<br />One software.
          </h1>
          <p className="fade-up fade-d1" style={{ fontSize: "0.95rem", lineHeight: 1.55, color: "var(--text-secondary)", margin: "0.9rem 0 0", maxWidth: "46ch" }}>
            Free research on any U.S. stock: fundamentals, filings, options and the market around it.
          </p>

          <div className="fade-up fade-d2" style={{ width: "min(34rem, 100%)", marginTop: "2rem" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              <div style={{ flex: "1 1 15rem", minWidth: 0, textAlign: "left" }}>
                <TickerInput value={null} onSubmit={open} action="" width="100%" large preferName
                  label="Search a company or ticker" placeholder="Apple or AAPL…" onDraftChange={setDraft} />
              </div>
              <Link href="/research" onClick={launch} className="pressable" style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, height: 52, padding: "0 26px",
                background: "var(--accent-gold)", color: "var(--on-accent)", borderRadius: 999,
                fontSize: "0.9rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flex: "0 0 auto",
              }}>
                Launch the Engine
                <Icon name="arrow-right" size={16} strokeWidth={2.2} />
              </Link>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
              <span className="home-try-label" style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginRight: 2 }}>Or start with</span>
              {TRY.map((t) => (
                <Link key={t} href={`/research?ticker=${t}`} className="home-try"
                  onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; e.preventDefault(); open(t); }}>
                  {t}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <MarketLine />
      </section>

      {/* ── What's inside ── */}
      <section aria-labelledby="inside" style={{ maxWidth: 1080, margin: "0 auto", padding: "4.5rem 1.5rem 4rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 20px", marginBottom: "1.4rem" }}>
          <h2 id="inside" style={{ fontFamily: DISPLAY, fontSize: "1.6rem", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1, margin: 0 }}>
            What&rsquo;s inside
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
            {TOOL_COUNT} tools. Free, with no account.
          </p>
        </div>

        {FEATURE_GROUPS.map((g) => (
          <div key={g.label} className="home-group">
            <h3 style={{ fontFamily: DISPLAY, fontSize: "1rem", fontWeight: 500, letterSpacing: "-0.015em", color: "var(--text-secondary)", margin: 0, padding: "8px 0" }}>
              {g.label}
            </h3>
            <div>
              {g.items.map((f) => (
                <Link key={f.href} href={f.href} className="home-row">
                  <span className="home-row-title" style={{ fontSize: "0.92rem", fontWeight: 600 }}>{f.title}</span>
                  <span style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{f.desc}</span>
                  <span className="home-row-go" style={{ alignSelf: "center", display: "inline-flex" }}><Icon name="arrow-right" size={15} strokeWidth={2} /></span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "2.25rem 0 calc(2rem + env(safe-area-inset-bottom, 0px))" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 max(1.5rem, env(safe-area-inset-right, 0px)) 0 max(1.5rem, env(safe-area-inset-left, 0px))", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "1.5rem 2rem" }}>
          <div>
            <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={170} height={54}
              style={{ objectFit: "contain", height: "auto", marginBottom: "0.8rem" }} />
            <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={170} height={54}
              style={{ objectFit: "contain", height: "auto", marginBottom: "0.8rem" }} />
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Made by Matthew Hanasab with <span className="heartbeat" aria-label="love" role="img">❤️</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
            <nav aria-label="About this site" style={{ display: "flex", gap: 18, fontSize: "0.82rem", flexWrap: "wrap" }}>
              <Link href="/about" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>About</Link>
              <Link href="/accessibility" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Accessibility</Link>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Source on GitHub <Icon name="external" size={12} />
              </a>
            </nav>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              <span suppressHydrationWarning>© {new Date().getFullYear()}</span> Prometheon Engine. Market data for research, not financial advice.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
