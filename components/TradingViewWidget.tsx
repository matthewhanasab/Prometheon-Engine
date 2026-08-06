"use client";
import { useEffect, useRef, useState } from "react";

// Generic TradingView embeddable widget.
//
// These use a different mechanism from the Advanced Chart (tv.js): each widget
// type has its own external-embedding script, and the config is passed as the
// script tag's text content rather than a constructor argument.
//
// This is TradingView's product embedded as intended — the licensed path. Data
// inside the iframe stays inside it; nothing is read out of the widget.
export type TvWidget =
  | "screener"
  | "hotlists"
  | "timeline"
  | "financials"
  | "technical-analysis"
  | "symbol-profile"
  | "symbol-info"
  | "events"
  | "market-overview"
  | "market-quotes";

export default function TradingViewWidget({
  widget,
  config,
  height = 480,
  transparentFrame = false,
}: {
  widget: TvWidget;
  config: Record<string, any>;
  height?: number | string;
  transparentFrame?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [themeTick, setThemeTick] = useState(0);

  // Widgets bake the colour theme in at construction, so a theme flip needs a
  // full rebuild rather than a prop update.
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = "";

    const isLight = document.documentElement.dataset.theme !== "dark";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    host.appendChild(inner);

    const script = document.createElement("script");
    script.src = `https://s3.tradingview.com/external-embedding/embed-widget-${widget}.js`;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      colorTheme: isLight ? "light" : "dark",
      isTransparent: true,
      locale: "en",
      width: "100%",
      height: typeof height === "number" ? height : "100%",
      ...config,
    });
    host.appendChild(script);

    return () => { host.innerHTML = ""; };
  }, [widget, JSON.stringify(config), height, themeTick]);

  return (
    <div
      className="tradingview-widget-container"
      ref={hostRef}
      style={{
        border: transparentFrame ? "none" : "1px solid var(--border)",
        borderRadius: transparentFrame ? 0 : 22,
        overflow: "hidden",
        height,
        background: "var(--bg-surface)",
      }}
    />
  );
}

/**
 * TradingView widgets want an exchange-qualified symbol (NASDAQ:AAPL).
 *
 * marketstack's tickerinfo returns Yahoo-style codes — NMS (Nasdaq NMS),
 * NYQ (NYSE), PCX (NYSE Arca, where most ETFs list) — alongside MIC codes on
 * other endpoints, so both vocabularies are mapped. TradingView files Arca
 * listings under AMEX. An unmatched code falls back to the bare ticker, which
 * TradingView resolves via its own search.
 */
export function tvSymbol(ticker: string, exchange?: string | null): string {
  const t = (ticker || "").toUpperCase();
  const ex = (exchange || "").toUpperCase().trim();
  if (!ex) return t;
  const NASDAQ = ["NMS", "NGM", "NCM", "NASDAQ", "XNAS"];
  const NYSE = ["NYQ", "NYE", "NYSE", "XNYS"];
  const AMEX = ["PCX", "ASE", "AMEX", "ARCX", "XASE", "NYSE ARCA", "NYSEARCA", "BATS"];
  if (NASDAQ.some((c) => ex === c || ex.includes(c))) return `NASDAQ:${t}`;
  if (AMEX.some((c) => ex === c || ex.includes(c))) return `AMEX:${t}`;
  if (NYSE.some((c) => ex === c || ex.includes(c))) return `NYSE:${t}`;
  return t;
}
