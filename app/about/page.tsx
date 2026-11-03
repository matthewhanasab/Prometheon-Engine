import type { Metadata } from "next";
import Link from "next/link";

const DESC =
  "What Prometheon Engine is, how it is built, and where every number comes from.";

export const metadata: Metadata = {
  title: "About",
  description: DESC,
  alternates: { canonical: "/about" },
  openGraph: { title: "About · Prometheon Engine", description: DESC, url: "https://prometheonengine.com/about" },
};

const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: SERIF, fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", margin: "2rem 0 0.6rem", letterSpacing: "-0.01em" }}>
      {children}
    </h2>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: "0.86rem", color: "var(--text-secondary)", lineHeight: 1.75, margin: "0 0 0.9rem" }}>{children}</p>;
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "9px 10px 9px 0", fontWeight: 600, whiteSpace: "nowrap", verticalAlign: "top", width: "34%" }}>{k}</td>
      <td style={{ padding: "9px 0", color: "var(--text-secondary)", lineHeight: 1.55 }}>{v}</td>
    </tr>
  );
}

export default function AboutPage() {
  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", maxWidth: 820, paddingBottom: "4rem" }}>
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        About Prometheon Engine
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <P>
        Prometheon Engine is a free stock-research terminal: fundamentals, valuation, statements, dividends,
        options, analyst consensus, insider and institutional activity, M&amp;A, macro — the numbers that matter,
        on one site, without a login. It is built and maintained by Matthew Hanasab as an independent project.
      </P>

      <H2>How the numbers are built</H2>
      <P>
        Wherever possible a figure is computed from the primary record rather than copied from a data vendor.
        Every margin, growth rate, multiple and per-share figure on the research, compare, charts and financials
        pages is derived from the company&apos;s own SEC filings (XBRL), including the reconstruction of fourth
        quarters from the annual report and split adjustment of share counts. Values that are projected rather
        than reported are labelled <em>model</em>; published analyst figures are labelled <em>consensus</em>.
      </P>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
        <tbody>
          <Row k="Fundamentals & statements" v="SEC EDGAR XBRL company facts and filing indexes." />
          <Row k="Prices, ratings, dividends, splits" v="Licensed market-data feeds; prices are end-of-day with intraday and live quotes during the session." />
          <Row k="Analyst estimates & earnings dates" v="Published consensus and exchange earnings calendars." />
          <Row k="Options" v="Cboe delayed quotes; Greeks and implied volatility computed on the site." />
          <Row k="Insider & institutional activity" v="SEC Form 4 filings and quarterly 13F holdings." />
          <Row k="Congress trades" v="House and Senate STOCK Act periodic transaction reports." />
          <Row k="M&A activity" v={<>Deal facts from <a href="https://www.mergersight.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>MergerSight</a>&apos;s published analyses, credited and linked on every card.</>} />
          <Row k="Macro" v="Federal Reserve Economic Data (FRED) series, refreshed every fifteen minutes." />
        </tbody>
      </table>

      <H2>How it is built</H2>
      <P>
        Next.js (App Router) and TypeScript on Vercel, with recharts for the charts. Each data source sits behind
        its own API route with edge and data caching tuned to how often the source actually changes; a scheduled
        job keeps the most-viewed tickers warm so a page typically answers in well under a second. Slower public
        records — congressional disclosures, 13F holdings, the M&amp;A record, the S&amp;P 500 list — are rebuilt
        on a weekly schedule by automated jobs and committed as snapshots. The code is open:{" "}
        <a href="https://github.com/matthewhanasab/Prometheon-Engine" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-gold)" }}>
          github.com/matthewhanasab/Prometheon-Engine
        </a>.
      </P>

      <H2>What it is not</H2>
      <P>
        Nothing on this site is investment advice, and no figure should be acted on without checking the primary
        filing. Data can be delayed, revised by the filer, or mis-tagged at the source; where a number cannot be
        derived with confidence the site says so rather than guessing.
      </P>

      <div style={{ marginTop: "2rem", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/research" style={{ background: "var(--accent-gold)", color: "var(--on-accent)", borderRadius: 999, padding: "10px 22px", fontSize: "0.74rem", fontWeight: 700, textDecoration: "none" }}>
          Open the research page
        </Link>
        <Link href="/accessibility" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 999, padding: "10px 18px", fontSize: "0.74rem", fontWeight: 600, textDecoration: "none" }}>
          Accessibility
        </Link>
      </div>
      <div style={{ fontFamily: MONO, fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "2rem" }}>
        prometheonengine.com
      </div>
    </div>
  );
}
