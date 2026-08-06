"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import CompanyLogo from "@/components/CompanyLogo";
import MsNav from "@/components/MsNav";
import TradingViewWidget, { tvSymbol } from "@/components/TradingViewWidget";

// Financials, Market Stack edition.
//
// marketstack's Statements/Facts/Concepts endpoints 404 despite being on the
// Business plan's feature list. Two working substitutes are combined here:
// TradingView's financials widget (quarterly + annual statements, in-frame),
// and this edition's own EDGAR-derived annual charts.
const SANS = "'Public Sans', sans-serif";
const SERIF = "'Space Grotesk', Georgia, serif";
const MONO = "'Spline Sans Mono', monospace";
const PICKS = ["AAPL", "NVDA", "MSFT", "KO", "IREN"];

function FinancialsInner() {
  const search = useSearchParams();
  const [input, setInput] = useState(search.get("ticker") ?? "AAPL");
  const [symbol, setSymbol] = useState(search.get("ticker") ?? "AAPL");
  const [exchange, setExchange] = useState<string | null>(null);
  const booted = useRef(false);

  // Only to resolve the exchange prefix TradingView needs (NASDAQ: / NYSE:).
  async function resolve(t: string) {
    setSymbol(t); setInput(t); setExchange(null);
    try {
      const res = await fetch(`/api/marketstack-stock/${t}`);
      const json = await res.json();
      if (res.ok && !json.error) setExchange(json.profile?.exchange ?? null);
    } catch { /* unqualified symbol still resolves via TradingView search */ }
  }
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    resolve(search.get("ticker") ?? "AAPL");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tv = tvSymbol(symbol, exchange);

  return (
    <div style={{ fontFamily: SANS, color: "var(--text-primary)", paddingBottom: "4rem" }}>
      <MsNav />
      <h1 style={{ fontFamily: SERIF, fontSize: "1.75rem", fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 0.4rem" }}>
        Financials
      </h1>
      <div style={{ height: 1, background: "linear-gradient(to right, var(--accent-gold), transparent)", opacity: 0.4, maxWidth: 200, marginBottom: "1rem" }} />
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: "1.2rem" }}>
        Income statement, balance sheet and cash flow — quarterly and annual, via the TradingView
        financials widget.
      </div>

      <form onSubmit={(e) => { e.preventDefault(); resolve(input.trim().toUpperCase()); }}
        style={{ display: "flex", gap: 10, maxWidth: 360, marginBottom: "0.7rem" }}>
        <input value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} placeholder="Ticker…"
          style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 22, padding: "10px 14px", color: "var(--text-primary)", fontFamily: MONO, fontSize: "0.85rem", outline: "none" }} />
        <button type="submit" style={{ background: "var(--accent-gold)", color: "var(--on-accent)", border: "none", borderRadius: 22, padding: "10px 22px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", cursor: "pointer" }}>
          Load
        </button>
      </form>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "1.2rem" }}>
        {PICKS.map((t) => (
          <button key={t} onClick={() => resolve(t)}
            style={{ background: symbol === t ? "var(--accent-gold)" : "var(--bg-elevated)", color: symbol === t ? "var(--on-accent)" : "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 12px", fontFamily: MONO, fontSize: "0.7rem", cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
        <CompanyLogo ticker={symbol} size={38} />
        <span style={{ fontFamily: MONO, fontSize: "1.1rem", fontWeight: 700 }}>{tv}</span>
      </div>

      <TradingViewWidget
        key={tv}
        widget="financials"
        height={560}
        config={{ symbol: tv, displayMode: "regular", largeChartUrl: "" }}
      />

      <div style={{ ...{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 22 }, padding: "16px 20px", marginTop: 14, fontSize: "0.76rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Prefer figures you can chart and export? This edition also derives ten years of annual revenue,
        net income, operating cash flow and EPS directly from SEC 10-K filings —{" "}
        <Link href={`/ms/charts?ticker=${symbol}`} style={{ color: "var(--accent-gold)" }}>see Charts →</Link>
      </div>
    </div>
  );
}

export default function MsFinancialsPage() {
  return <Suspense fallback={null}><FinancialsInner /></Suspense>;
}
