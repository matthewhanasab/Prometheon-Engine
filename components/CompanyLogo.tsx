"use client";
import { useState } from "react";

// Company logo via our same-origin /api/logo proxy (the icon of the company's
// own website), presented 1000x-style: a white rounded tile so dark or
// transparent marks stay visible in both themes.
//
// On error the default is to hide entirely (unchanged for existing callers).
// Pass `fallback` to instead render a ticker monogram tile — used in dense
// lists (the earnings calendar) where every row must carry an icon.
//
// A dense page asks for dozens of logos at once and the odd one is throttled
// upstream. Those failures are temporary, so a failed logo is asked for once
// more a couple of seconds later before the component gives up.
type Phase = "first" | "wait" | "retry" | "failed";

export default function CompanyLogo({
  ticker,
  size = 56,
  fallback = false,
}: {
  ticker: string;
  size?: number;
  fallback?: boolean;
}) {
  // Tagged with the ticker it belongs to, so a new ticker starts clean without
  // an effect to reset it.
  const [st, setSt] = useState<{ t: string; phase: Phase }>({ t: ticker, phase: "first" });
  const phase: Phase = st.t === ticker ? st.phase : "first";
  if (!ticker) return null;

  const radius = Math.max(10, size * 0.22);
  const sym = ticker.toUpperCase();

  const onError = () => {
    if (phase === "first") {
      setSt({ t: ticker, phase: "wait" });
      // Jittered so a column of failures doesn't retry as another burst.
      setTimeout(() => setSt((s) => (s.t === ticker && s.phase === "wait" ? { t: ticker, phase: "retry" } : s)), 1500 + Math.random() * 2500);
    } else {
      setSt({ t: ticker, phase: "failed" });
    }
  };

  if (phase === "wait" || phase === "failed") {
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
        {sym.slice(0, 2)}
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
        key={phase}
        src={`/api/logo/${encodeURIComponent(sym)}${phase === "retry" ? "?r=1" : ""}`}
        alt={`${sym} logo`}
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        loading="lazy"
        decoding="async"
        style={{ objectFit: "contain" }}
        onError={onError}
      />
    </span>
  );
}
