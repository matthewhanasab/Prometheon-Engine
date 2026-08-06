"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import MsNav from "@/components/MsNav";

// Catch-all for the Market Stack mirror: any main-site page that has no real
// /ms port lands here with an exact-URL mirror and an honest explanation.
// Ported pages (research, compare, charts, dividends, calculator) are static
// routes, which take precedence over this catch-all in the App Router.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const CARD: React.CSSProperties = {
  background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 22,
};

const PAGES: Record<string, { title: string; reason: string; alt?: { href: string; label: string } }> = {
  fairvalue: {
    title: "Fair Value Graph",
    reason: "The Fair Value Graph plots price against analyst forward EPS estimates. Marketstack's ratings endpoint provides price targets and buy/hold/sell calls, but no EPS or revenue forecasts — the estimate layer that powers this page doesn't exist there.",
    alt: { href: "/ms/research", label: "DCF fair value on Research →" },
  },
  projections: {
    title: "Projections",
    reason: "Projections are built from analyst forward estimates (EPS, revenue, growth). No marketstack tier carries estimate data, and estimates can't be read out of a TradingView widget either.",
  },
  "covered-calls": {
    title: "Covered Calls",
    reason: "Options chains (strikes, premiums, expirations, greeks) are not offered by marketstack at any tier.",
  },
  puts: {
    title: "Cash-Secured Puts",
    reason: "Options chains (strikes, premiums, expirations, greeks) are not offered by marketstack at any tier.",
  },
  congress: {
    title: "Congress Trades",
    reason: "The main site sources congressional trading via FMP. The underlying disclosures are public (Senate/House portals) and could be wired in directly, but that isn't built yet — and marketstack itself has no such data.",
  },
  insider: {
    title: "Insider Trading",
    reason: "Form 4 filings appear in the Research page's SEC Filings section, but parsed insider transactions — buyer, direction, shares, value — need an EDGAR parsing layer marketstack doesn't provide.",
    alt: { href: "/ms/research", label: "Form 4 filings on Research →" },
  },
  sec: {
    title: "SEC Filings",
    reason: "Headline filings (10-K, 10-Q, 8-K, Form 4) are already on the Research page via marketstack's submissions endpoint. A dedicated full-text filing browser hasn't been ported.",
    alt: { href: "/ms/research", label: "Filings on Research →" },
  },
  macro: {
    title: "Macro Dashboard",
    reason: "The macro page runs mostly on FRED, but several series come through FMP. The FRED portion is portable; it just hasn't been split out yet.",
  },
  etf: {
    title: "ETF Hub",
    reason: "Marketstack's etfholdings endpoint is on the Business plan's feature list but returns \"no data is available for this ticker\" even for SPY and QQQ. Worth a support ticket — this one is paid for.",
  },
  portfolio: {
    title: "My Portfolio",
    reason: "Portfolio tracking needs live quotes for your holdings — which marketstack does provide. The page just hasn't been rewired to it yet; it's the most portable item on this list.",
  },
};

export default function MsCatchAll() {
  const pathname = usePathname() ?? "/ms";
  const slug = pathname.replace(/^\/ms\//, "").split("/")[0];
  const page = PAGES[slug] ?? {
    title: slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    reason: "This page has no Market Stack equivalent yet.",
  };

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        {page.title}
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1.6rem" }} />

      <div style={{ ...CARD, padding: "26px 28px", maxWidth: 720 }}>
        <div style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: 10 }}>
          Not available on Market Stack
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
          {page.reason}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {page.alt && (
            <Link href={page.alt.href} style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--on-accent)", background: "var(--accent-gold)", borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>
              {page.alt.label}
            </Link>
          )}
          <Link href="/ms" style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>
            ← Market Stack hub
          </Link>
          <Link href={`/${slug}`} style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>
            View on FMP site →
          </Link>
        </div>
      </div>
    </div>
  );
}
