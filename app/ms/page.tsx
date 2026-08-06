"use client";
import Link from "next/link";
import MsNav from "@/components/MsNav";

// Hub for the Market Stack edition: the Prometheon experience rebuilt without
// FMP. Data providers: marketstack (Business), SEC EDGAR (public domain),
// FRED (public), TradingView widget (embedded product).
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22,
};
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";

const LIVE: { href: string; title: string; desc: string; src: string }[] = [
  {
    href: "/ms/research",
    title: "Stock Research",
    desc: "Full research page — live IEX quotes, intraday chart, 15-year returns, fundamentals, analyst ratings, F-Score / Z-Score / DCF, dividends, SEC filings.",
    src: "marketstack + EDGAR + FRED",
  },
  {
    href: "/ms/compare",
    title: "Compare Stocks",
    desc: "Up to four tickers side by side: valuation, margins, returns over 1–15 years, beta, quality scores.",
    src: "marketstack + EDGAR",
  },
  {
    href: "/ms/charts",
    title: "Financial Charts",
    desc: "A decade of annual revenue, net income, operating cash flow, EPS and net margin, straight from SEC filings.",
    src: "SEC EDGAR XBRL",
  },
  {
    href: "/ms/dividends",
    title: "Dividends",
    desc: "Complete dividend record — Coca-Cola's goes back to 1977 — with annual totals, upcoming payments and yield.",
    src: "marketstack",
  },
  {
    href: "/ms/calculator",
    title: "Compound Calculator",
    desc: "Pure math, no data provider — shared with the main site verbatim.",
    src: "no external data",
  },
];

const UNAVAILABLE: { title: string; why: string }[] = [
  { title: "Macro Dashboard", why: "mostly FRED, but several series come through FMP — the FRED portion is portable, not yet split out" },
  { title: "My Portfolio", why: "quotes are portable via marketstack; the page just isn't rewired yet" },
  { title: "ETF Hub", why: "marketstack's etfholdings endpoint returns no data even for SPY — raised as a support issue" },
  { title: "Screener / Market Movers", why: "no screening or gainers-losers endpoint" },
  { title: "Earnings (estimates & surprises)", why: "no analyst EPS/revenue estimates — this also blocks Forward P/E" },
  { title: "Covered Calls / Cash-Secured Puts", why: "no options chain data" },
  { title: "Congress Trades", why: "different data domain (official disclosure portals); not FMP-dependent but not built into this edition yet" },
  { title: "Insider Trading (parsed)", why: "Form 4 filings are listed on Research, but parsed buy/sell transactions need an EDGAR parsing layer" },
  { title: "Earnings Call Transcripts", why: "not offered by marketstack at any tier" },
  { title: "News", why: "no news endpoint (the main site uses Finnhub)" },
];

export default function MsHub() {
  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.9rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Prometheon — Market Stack Edition
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 240, marginBottom: "1rem" }} />
      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: 720, lineHeight: 1.65, marginBottom: "0.4rem" }}>
        The same site, rebuilt on commercially-licensed and public-domain data:{" "}
        <strong>marketstack</strong> (prices, intraday, ratings, dividends, splits),{" "}
        <strong>SEC EDGAR</strong> (fundamentals, filings), <strong>FRED</strong> (rates) and the{" "}
        <strong>TradingView</strong> widget. No FMP anywhere on these pages.
      </p>
      <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "1.8rem" }}>
        This is the deployable-to-the-public stack — the main site remains on FMP under a personal-use license.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 92vw), 1fr))", gap: 12, marginBottom: "2.2rem" }}>
        {LIVE.map((c) => (
          <Link key={c.href} href={c.href} style={{ ...CARD, padding: "18px 20px", textDecoration: "none", color: "inherit", display: "block" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: SERIF, fontSize: "1.05rem", fontWeight: 600 }}>{c.title}</span>
              <span style={{ fontSize: "0.56rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--positive)" }}>Live</span>
            </div>
            <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", lineHeight: 1.55, marginBottom: 8 }}>{c.desc}</div>
            <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "'Spline Sans Mono', monospace" }}>{c.src}</div>
          </Link>
        ))}
      </div>

      <div style={{
        fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.14em", color: "var(--text-secondary)",
        borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "0.9rem",
      }}>
        Not in this edition
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 92vw), 1fr))", gap: 10 }}>
        {UNAVAILABLE.map((u) => (
          <div key={u.title} style={{ ...CARD, padding: "13px 16px", opacity: 0.65, borderStyle: "dashed" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 3 }}>{u.title}</div>
            <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{u.why}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
