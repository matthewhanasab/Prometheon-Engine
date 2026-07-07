"use client";
import { useEffect, useRef } from "react";

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
  const widgetRef    = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = "";
    const id = `tv_${ticker}_${Date.now()}`;
    containerRef.current.id = id;

    function init() {
      const config: Record<string, any> = {
        autosize:            true,
        symbol:              ticker,
        interval:            interval,
        timezone:            "America/New_York",
        theme:               "dark",
        style:               "1",
        locale:              "en",
        toolbar_bg:          "#111827",
        enable_publishing:   false,
        hide_side_toolbar:   false,
        allow_symbol_change: false,
        save_image:          false,
        container_id:        id,
        studies:             [],
        overrides: {
          "paneProperties.background":                        "#0A0F1E",
          "paneProperties.backgroundType":                    "solid",
          "paneProperties.vertGridProperties.color":          "#1E2D45",
          "paneProperties.horzGridProperties.color":          "#1E2D45",
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
      if (widgetRef.current?.remove) widgetRef.current.remove();
    };
  }, [ticker, interval, range]);

  return (
    <div style={{
      border:       "1px solid var(--border)",
      borderRadius: 4,
      overflow:     "hidden",
      height,
    }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
