"use client";
import { useEffect, useRef, useState } from "react";

// TradingView Stock Heatmap embed — S&P 500 treemap by sector, sized by market
// cap and colored by performance, matching the one on TradingView.
export default function StockHeatmap({ height = 620 }: { height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const isLight = document.documentElement.dataset.theme !== "dark";
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      dataSource: "SPX500",
      blockSize: "market_cap_basic",
      blockColor: "change",
      grouping: "sector",
      locale: "en",
      symbolUrl: "",
      colorTheme: isLight ? "light" : "dark",
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      isThemeEnabled: false,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    });
    container.appendChild(script);

    return () => { container.innerHTML = ""; };
  }, [themeTick]);

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden", height }}>
      <div ref={containerRef} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
