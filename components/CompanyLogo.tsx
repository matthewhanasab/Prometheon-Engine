"use client";
import { useState, useEffect } from "react";

// Company logo via our same-origin /api/logo proxy (company-website favicon,
// resolved through marketstack's tickerinfo), presented 1000x-style: a white
// rounded tile so dark/transparent marks stay visible in both themes. Hides
// itself entirely when no image exists for the ticker.
export default function CompanyLogo({ ticker, size = 56 }: { ticker: string; size?: number }) {
  const [ok, setOk] = useState(true);
  useEffect(() => { setOk(true); }, [ticker]);
  if (!ok || !ticker) return null;
  return (
    <span style={{
      width: size, height: size, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "#FFFFFF", borderRadius: Math.max(10, size * 0.22),
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
