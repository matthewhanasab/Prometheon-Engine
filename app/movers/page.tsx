"use client";

import TradingViewWidget from "@/components/TradingViewWidget";
import StockHeatmap from "@/components/StockHeatmap";
import MarketStrip from "@/components/MarketStrip";
import PageHeader from "@/components/PageHeader";

// Market Movers. All panels are TradingView embeds — hotlists (gainers/losers/
// most-active), the S&P 500 heatmap, and a market-wide overview.
const SANS = "'Public Sans', sans-serif";

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
      fontFamily: SANS, fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase",
      letterSpacing: "0.14em", color: "var(--text-secondary)",
      borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", margin: "2rem 0 0.9rem",
    }}>
      <span>{children}</span>
      {hint && <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, color: "var(--text-muted)", fontSize: "0.6875rem" }}>{hint}</span>}
    </div>
  );
}

export default function MsMoversPage() {
  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)" }}>
      <PageHeader title="Market Movers"
        subtitle="Today's biggest gainers, losers and most-active names, with index levels and a map of where the market is moving." />

      <Label hint="index levels · day, week, month, year">Indices</Label>
      <MarketStrip />

      <Label hint="S&amp;P 500 by market cap · sized &amp; colored by daily move">Heatmap</Label>
      <StockHeatmap height={620} />

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

      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 14, lineHeight: 1.6 }}>
        Both panels are TradingView widgets — their data, displayed in their frame.
      </div>
    </div>
  );
}
