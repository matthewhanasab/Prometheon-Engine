"use client";
import MsNav from "@/components/MsNav";
import TradingViewWidget from "@/components/TradingViewWidget";

// Market Movers, Market Stack edition.
//
// marketstack has no gainers/losers/most-active endpoint. TradingView's
// hotlists widget provides exactly that, and the heatmap on the main site is
// already a TradingView embed — so this page ports cleanly.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.58rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>
      {hint && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.62rem" }}>{hint}</span>}
    </div>
  );
}

export default function MsMoversPage() {
  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Market Movers
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
        Today&apos;s biggest gainers, losers and most-active names, plus a market-wide snapshot.
      </div>

      <Label hint="gainers · losers · most active">Hotlists</Label>
      <TradingViewWidget
        widget="hotlists"
        height={480}
        config={{ dataSource: "AllUSAStocks", exchange: "US", showChart: true, showSymbolLogo: true }}
      />

      <Label hint="indices, futures, bonds, forex">Market Overview</Label>
      <TradingViewWidget
        widget="market-overview"
        height={440}
        config={{ showFloatingTooltip: true, showSymbolLogo: true, dateRange: "1D" }}
      />

      <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 14, lineHeight: 1.6 }}>
        Both panels are TradingView widgets — their data, displayed in their frame.
      </div>
    </div>
  );
}
