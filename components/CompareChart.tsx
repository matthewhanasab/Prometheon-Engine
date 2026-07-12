"use client";
import { useEffect, useRef } from "react";

// TradingView advanced chart with all tickers overlaid on one percentage scale
export default function CompareChart({ tickers, height = 460 }: { tickers: string[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || tickers.length === 0) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tickers[0],
      compareSymbols: tickers.slice(1).map((t) => ({ symbol: t, position: "SameScale" })),
      interval: "D",
      range: "12M",
      timezone: "America/New_York",
      theme: "dark",
      style: "2",
      locale: "en",
      backgroundColor: "#0A120D",
      gridColor: "rgba(61, 230, 140, 0.10)",
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      hide_volume: true,
      extended_hours: false,
      session: "regular",
      disabled_features: ["pre_post_market_price_line", "show_exchange_logos"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => { container.innerHTML = ""; };
  }, [tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", height }}>
      <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
