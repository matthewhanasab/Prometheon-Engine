"use client";
import { useState, useEffect } from "react";

// Company logo via our same-origin /api/logo proxy (company-website favicon,
// resolved through marketstack's tickerinfo), presented 1000x-style: a white
// rounded tile so dark/transparent marks stay visible in both themes.
//
// On error the default is to hide entirely (unchanged for existing callers).
// Pass `fallback` to instead render a ticker monogram tile — used in dense
// lists (the earnings calendar) where every row must carry an icon even when a
// favicon can't be resolved or hasn't warmed yet.
export default function CompanyLogo({
  ticker,
  size = 56,
  fallback = false,
}: {
  ticker: string;
  size?: number;
  fallback?: boolean;
}) {
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [ticker]);
  if (!ticker) return null;

  const radius = Math.max(10, size * 0.22);

  if (!ok) {
    if (!fallback) return null;
    return (
      <span style={{
        width: size, height: size, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: "var(--bg-elevated)", borderRadius: radius,
        border: "1px solid var(--border)", color: "var(--text-secondary)",
        fontFamily: "'Spline Sans Mono', monospace", fontWeight: 700,
        fontSize: Math.round(size * 0.34), letterSpacing: "-0.03em",
      }}>
        {ticker.toUpperCase().slice(0, 2)}
      </span>
    );
  }

  return (
    <span style={{
      width: size, height: size, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "#FFFFFF", borderRadius: radius,
      border: "1px solid var(--border)",
      overflow: "hidden",
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/logo/${encodeURIComponent(ticker.toUpperCase())}`}
        alt={`${ticker.toUpperCase()} logo`}
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        style={{ objectFit: "contain" }}
        onError={() => setOk(false)}
      />
    </span>
  );
}
