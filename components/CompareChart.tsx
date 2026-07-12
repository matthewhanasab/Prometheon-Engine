"use client";
import { useEffect, useRef, useState } from "react";

// TradingView advanced chart with all tickers overlaid on one percentage scale
export default function CompareChart({ tickers, height = 460 }: { tickers: string[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick(t => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || tickers.length === 0) return;
    const container = containerRef.current;
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    container.appendChild(widgetDiv);

    const isLight = document.documentElement.dataset.theme !== "dark";
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
      theme: isLight ? "light" : "dark",
      style: "2",
      locale: "en",
      backgroundColor: isLight ? "#FFFFFF" : "#0C1220",
      gridColor: "var(--cursor-fill)",
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
  }, [tickers.join(","), themeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden", height }}>
      <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
