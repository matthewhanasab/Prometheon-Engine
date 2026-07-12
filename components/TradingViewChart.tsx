"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { TradingView: any; }
}

interface TradingViewChartProps {
  ticker: string;
  interval?: string;
  range?: string;
  height?: number;
}

export default function TradingViewChart({ ticker, interval = "D", range, height = 500 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick(t => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  const widgetRef    = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";
    const id = `tv_${ticker}_${Date.now()}`;
    containerRef.current.id = id;

    const isLight = document.documentElement.dataset.theme !== "dark";
    let cancelled = false;
    function init() {
      if (cancelled || !document.getElementById(id)) return;
      const config: Record<string, any> = {
        autosize:            true,
        symbol:              ticker,
        interval:            interval,
        timezone:            "America/New_York",
        theme:               isLight ? "light" : "dark",
        style:               "1",
        locale:              "en",
        toolbar_bg:          isLight ? "#FFFFFF" : "#101828",
        enable_publishing:   false,
        hide_side_toolbar:   false,
        allow_symbol_change: false,
        save_image:          false,
        container_id:        id,
        studies:             [],
        overrides: {
          "paneProperties.background":                        isLight ? "#FFFFFF" : "#0C1220",
          "paneProperties.backgroundType":                    "solid",
          "paneProperties.vertGridProperties.color":          isLight ? "#E5EAF2" : "#1B2436",
          "paneProperties.horzGridProperties.color":          isLight ? "#E5EAF2" : "#1B2436",
          "mainSeriesProperties.candleStyle.upColor":         "#22C55E",
          "mainSeriesProperties.candleStyle.downColor":       "#EF4444",
          "mainSeriesProperties.candleStyle.borderUpColor":   "#22C55E",
          "mainSeriesProperties.candleStyle.borderDownColor": "#EF4444",
          "mainSeriesProperties.candleStyle.wickUpColor":     "#22C55E",
          "mainSeriesProperties.candleStyle.wickDownColor":   "#EF4444",
        },
      };
      if (range) config.range = range;
      widgetRef.current = new window.TradingView.widget(config);
    }

    if (window.TradingView) {
      init();
    } else {
      const script = document.createElement("script");
      script.src   = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      try { widgetRef.current?.remove?.(); } catch { /* widget already gone */ }
      widgetRef.current = null;
    };
  }, [ticker, interval, range, themeTick]);

  return (
    <div style={{
      border:       "1px solid var(--border)",
      borderRadius: 22,
      overflow:     "hidden",
      height,
    }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
