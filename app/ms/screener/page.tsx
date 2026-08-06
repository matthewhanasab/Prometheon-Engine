"use client";
import { useState } from "react";
import MsNav from "@/components/MsNav";
import TradingViewWidget from "@/components/TradingViewWidget";

// Screener, Market Stack edition.
//
// marketstack has no screening endpoint at any tier, so this was previously a
// dead page. TradingView's screener widget covers it — embedded as their
// product, which is the licensed path (no data is read out of the frame).
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";

const MARKETS: { key: string; label: string }[] = [
  { key: "america", label: "US" },
  { key: "uk", label: "UK" },
  { key: "germany", label: "Germany" },
  { key: "japan", label: "Japan" },
  { key: "canada", label: "Canada" },
];

const SCREENS: { key: string; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "price, change, volume, market cap" },
  { key: "performance", label: "Performance", hint: "returns across timeframes" },
  { key: "valuation", label: "Valuation", hint: "P/E, P/S, P/B, EV multiples" },
  { key: "dividends", label: "Dividends", hint: "yield, payout, ex-dates" },
  { key: "margins", label: "Margins", hint: "gross, operating, net" },
  { key: "income_statement", label: "Income Statement", hint: "revenue, EPS, growth" },
  { key: "balance_sheet", label: "Balance Sheet", hint: "debt, cash, ratios" },
  { key: "technicals", label: "Technicals", hint: "RSI, MACD, moving averages" },
];

export default function MsScreenerPage() {
  const [market, setMarket] = useState("america");
  const [screen, setScreen] = useState("overview");

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? "var(--accent-gold)" : "var(--bg-elevated)",
    color: active ? "var(--on-accent)" : "var(--text-secondary)",
    border: "1px solid var(--border)", borderRadius: 999,
    padding: "5px 13px", fontSize: "0.72rem", fontWeight: 600,
    cursor: "pointer", fontFamily: SANS,
  });

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Screener
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Screen the whole market across valuation, growth, dividends and technicals — powered by the
        TradingView screener widget.
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {MARKETS.map((m) => (
          <button key={m.key} onClick={() => setMarket(m.key)} style={chip(market === m.key)}>{m.label}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {SCREENS.map((s) => (
          <button key={s.key} onClick={() => setScreen(s.key)} style={chip(screen === s.key)}>{s.label}</button>
        ))}
      </div>
      <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginBottom: "1.1rem" }}>
        {SCREENS.find((s) => s.key === screen)?.hint}
      </div>

      <TradingViewWidget
        widget="screener"
        height={620}
        config={{
          market,
          defaultColumn: screen,
          defaultScreen: "most_capitalized",
          showToolbar: true,
        }}
      />

      <div style={{ fontSize: "0.66rem", color: "var(--text-muted)", marginTop: 12, lineHeight: 1.6 }}>
        Sorting and filtering happen inside TradingView&apos;s widget. Click any row to open that symbol on
        TradingView — Prometheon reads nothing out of the frame.
      </div>
    </div>
  );
}
