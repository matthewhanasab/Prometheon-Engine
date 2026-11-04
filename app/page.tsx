"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import MarketStrip from "@/components/MarketStrip";

// Landing page.
//
// A product page, not a pitch: say in one line what the site is, put the
// ticker box where the eye lands, and show real numbers (today's indices)
// before any marketing. The sections below are text-first — a reader should
// be able to find a tool by name in a few seconds, which a wall of identical
// cards did not allow.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

const POPULAR = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "JPM"];

const GROUPS = [
  { label: "Research", blurb: "One company at a time, from its own filings.", items: [
    { href: "/research?ticker=AAPL",   title: "Stock Research",       desc: "Valuation, growth, margins, analyst consensus, insiders and ownership on one page." },
    { href: "/compare?t=AAPL,MSFT",    title: "Compare Stocks",       desc: "Up to four tickers side by side, with the typical range for each metric." },
    { href: "/charts?ticker=NVDA",     title: "Financial Charts",     desc: "Revenue, margins, EPS, cash flow and multiples by quarter, back to 2018." },
    { href: "/financials?ticker=MSFT", title: "Financial Statements", desc: "Income statement, balance sheet and cash flow, annual and quarterly." },
  ]},
  { label: "Markets", blurb: "What the market is doing this week.", items: [
    { href: "/earnings", title: "Earnings Calendar", desc: "Who reports each day, before the open or after the close, and the consensus estimate." },
    { href: "/macro",    title: "Macro Dashboard",   desc: "Rates, inflation, the yield curve and index levels, dated and kept current." },
    { href: "/movers",   title: "Market Movers",     desc: "Index levels, gainers, losers and a sector heatmap." },
    { href: "/screener", title: "Screener",          desc: "Filter the whole market by sector, size, valuation and profitability." },
  ]},
  { label: "Smart Money", blurb: "Public records of who is buying what.", items: [
    { href: "/congress", title: "Congress Trades", desc: "Every stock trade disclosed by members of Congress under the STOCK Act." },
    { href: "/insider",  title: "Insider Trading", desc: "Form 4 filings: executive and director buys and sales, valued and flagged." },
    { href: "/mna",      title: "M&A Activity",    desc: "Acquisitions, buyouts and IPOs by industry, with value, dates and advisors." },
    { href: "/sec",      title: "SEC Filings",     desc: "10-Ks, 10-Qs and 8-Ks straight from EDGAR." },
  ]},
  { label: "Income & Planning", blurb: "Dividends, options and scenarios.", items: [
    { href: "/dividends?ticker=KO",       title: "Dividend Hub",        desc: "Payment history, yield, growth streak and the next ex-dividend date." },
    { href: "/options-chain?ticker=AAPL", title: "Options Chain",       desc: "Live quotes, implied volatility and Greeks for every listed contract." },
    { href: "/projections?ticker=AMD",    title: "Projections",         desc: "Bull, base and bear five-year scenarios with editable assumptions." },
    { href: "/covered-calls?ticker=TSLA", title: "Covered Calls",       desc: "Premium income ranked by strike, with the odds of keeping it." },
  ]},
];

const FOOTER_COLUMNS = [
  { title: "Research", links: [
    { href: "/research",   label: "Stock Research" },
    { href: "/compare",    label: "Compare Stocks" },
    { href: "/charts",     label: "Financial Charts" },
    { href: "/financials", label: "Financial Statements" },
    { href: "/screener",   label: "Screener" },
  ]},
  { title: "Markets", links: [
    { href: "/earnings",  label: "Earnings Calendar" },
    { href: "/macro",     label: "Macro Dashboard" },
    { href: "/movers",    label: "Market Movers" },
    { href: "/dividends", label: "Dividend Hub" },
    { href: "/etf",       label: "ETF Hub" },
  ]},
  { title: "Smart Money", links: [
    { href: "/mna",           label: "M&A Activity" },
    { href: "/congress",      label: "Congress Trades" },
    { href: "/insider",       label: "Insider Trading" },
    { href: "/sec",           label: "SEC Filings" },
    { href: "/options-chain", label: "Options Chain" },
  ]},
];

function Wordmark({ height = 44 }: { height?: number }) {
  const w = Math.round(height * 3.1);
  return (
    <>
      <Image className="logo-on-light" src="/logo_transparent_dark.png" alt="Prometheon Engine" width={w} height={height} priority style={{ objectFit: "contain", height: "auto", width: w }} />
      <Image className="logo-on-dark" src="/logo_transparent.png" alt="Prometheon Engine" width={w} height={height} priority style={{ objectFit: "contain", height: "auto", width: w }} />
    </>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");

  const go = (t: string) => {
    const clean = t.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    if (clean) router.push(`/research?ticker=${clean}`);
  };

  return (
    <div className="landing" style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <ThemeToggle floating />

      {/* ── Header ── */}
      <header style={{ maxWidth: 1200, margin: "0 auto", padding: "1.4rem 1.5rem 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <Link href="/" aria-label="Prometheon Engine" style={{ display: "inline-flex" }}><Wordmark height={40} /></Link>
        <nav aria-label="Primary" className="landing-nav" style={{ gap: 18, fontSize: "0.74rem", fontWeight: 600, letterSpacing: "0.04em", marginRight: 64 }}>
          {[["/research", "Research"], ["/compare", "Compare"], ["/charts", "Charts"], ["/earnings", "Earnings"], ["/about", "About"]].map(([href, label]) => (
            <Link key={href} href={href} className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>{label}</Link>
          ))}
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "5.5rem 1.5rem 3rem" }}>
        <div style={{ maxWidth: 760 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: "clamp(1.9rem, 4.2vw, 3rem)", fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1.1, margin: "0 0 1.1rem" }}>
            Stock research from primary sources.
          </h1>
          <p style={{ fontSize: "clamp(0.92rem, 1.4vw, 1.05rem)", color: "var(--text-secondary)", lineHeight: 1.65, margin: "0 0 1.8rem", maxWidth: 640 }}>
            Fundamentals computed from each company&apos;s SEC filings. Prices, ratings and analyst consensus from
            licensed feeds. Insider, institutional and congressional trades from the public record.
            One terminal, no account, free.
          </p>

          <form onSubmit={(e) => { e.preventDefault(); go(ticker); }} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="Ticker" aria-label="Ticker symbol" autoFocus
              style={{ fontFamily: MONO, fontSize: "1rem", padding: "13px 18px", borderRadius: 999, width: 190, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", outline: "none" }} />
            <button type="submit" style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "13px 26px", fontFamily: SANS, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}>
              Research
            </button>
            <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginLeft: 6 }}>
              {POPULAR.map((t) => (
                <Link key={t} href={`/research?ticker=${t}`} style={{ fontFamily: MONO, fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 11px", textDecoration: "none" }}>
                  {t}
                </Link>
              ))}
            </span>
          </form>
        </div>
      </section>

      {/* ── Markets today ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem 3.5rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 12 }}>
          <span>Markets today</span>
          <Link href="/macro" style={{ color: "var(--accent-gold)", textDecoration: "none", textTransform: "none", letterSpacing: 0, fontSize: "0.68rem" }}>Macro dashboard →</Link>
        </div>
        <MarketStrip />
      </section>

      {/* ── What's inside ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem 3.5rem" }}>
        <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border)", paddingBottom: 6, marginBottom: 20 }}>
          What&apos;s inside
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "2rem 2.5rem" }}>
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div style={{ fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 600, letterSpacing: "-0.01em", marginBottom: 2 }}>{g.label}</div>
              <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: 12 }}>{g.blurb}</div>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className="footer-link" style={{ display: "block", textDecoration: "none", padding: "9px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 600, color: "var(--text-primary)" }}>{it.title}</span>
                  <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: 1.5, marginTop: 2 }}>{it.desc}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── How it is built ── */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "0 1.5rem 4rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
          {[
            ["Computed, not copied", "Margins, growth, multiples and per-share figures are derived from XBRL filings — fourth quarters reconstructed from the 10-K, share counts split-adjusted."],
            ["Labelled honestly", "Published analyst figures are marked consensus; anything projected from the filed trend is marked model. If a number can't be derived with confidence, the page says so."],
            ["Kept current", "Prices are live during the session; earnings and macro refresh through the day; congressional, institutional and M&A records rebuild weekly."],
          ].map(([h, p]) => (
            <div key={h} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22, padding: "16px 18px" }}>
              <div style={{ fontFamily: SERIF, fontSize: "0.95rem", fontWeight: 600, marginBottom: 6 }}>{h}</div>
              <div style={{ fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{p}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, fontSize: "0.74rem", color: "var(--text-muted)" }}>
          <Link href="/about" style={{ color: "var(--accent-gold)", textDecoration: "none" }}>How every number is built →</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid var(--border)", padding: "3.5rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) repeat(auto-fit, minmax(150px, 1fr))", gap: "2.5rem 2rem" }}>
          <div>
            <div style={{ marginBottom: "1rem" }}><Wordmark height={48} /></div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6, maxWidth: 300, marginBottom: "1rem" }}>
              Stock research from primary sources, free for everyone.
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Made by Matthew Hanasab with <span className="heartbeat" aria-label="love" role="img">❤️</span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: "0.78rem" }}>
              <Link href="/about" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>About</Link>
              <a href="https://github.com/matthewhanasab/Prometheon-Engine" target="_blank" rel="noopener noreferrer" className="footer-link" style={{ color: "var(--text-secondary)", textDecoration: "none" }}>Source on GitHub ↗</a>
            </div>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <div style={{ fontFamily: SERIF, fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.9rem" }}>
                {col.title}
              </div>
              {col.links.map((l) => (
                <Link key={l.href} href={l.href} className="footer-link"
                  style={{ display: "block", fontSize: "0.82rem", color: "var(--text-secondary)", textDecoration: "none", marginBottom: "0.6rem" }}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1200, margin: "2.5rem auto 0", paddingTop: "1.2rem", borderTop: "1px solid var(--border)", fontSize: "0.62rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Prometheon Engine · Market data for research purposes · Not financial advice
        </div>
      </footer>
    </div>
  );
}
