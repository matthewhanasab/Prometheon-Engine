"use client";
import { useRef, useState, useEffect } from "react";
import { copyImageToClipboard, saveImage, prefersNativeShare } from "./shareImage";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Inline resolved styles onto a cloned SVG so CSS-variable colors survive when
// the SVG is rasterized in isolation (data-URL images don't see document vars).
const STYLE_PROPS = [
  "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "stroke-opacity", "fill-opacity", "opacity", "color",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline",
];
function inlineComputed(src: Element, clone: Element) {
  const cs = window.getComputedStyle(src);
  let s = "";
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) s += `${p}:${v};`;
  }
  clone.setAttribute("style", s);
  const sc = src.children, cc = clone.children;
  for (let i = 0; i < sc.length && i < cc.length; i++) inlineComputed(sc[i], cc[i]);
}

async function captureChart(
  svg: SVGSVGElement,
  legend: { text: string; color: string }[],
  opts: { title: string; ticker: string; companyName?: string }
): Promise<Blob> {
  const isDark = document.documentElement.dataset.theme === "dark";
  const rect = svg.getBoundingClientRect();
  const cw = Math.max(1, Math.round(rect.width));
  const ch = Math.max(1, Math.round(rect.height));

  const SCALE = 2, PAD = 44, HEADER = 78, LEGEND = legend.length ? 40 : 0, FOOTER = 56;

  // Clone + inline computed styles, then rasterize the SVG at SCALE× so the
  // chart layer matches the canvas's pixel density. A viewBox is required —
  // recharts only sets width/height, and without one, upsizing those would
  // leave the drawing at its original size in a corner instead of scaling.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputed(svg, clone);
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
  clone.setAttribute("width", String(cw * SCALE));
  clone.setAttribute("height", String(ch * SCALE));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const svgStr = new XMLSerializer().serializeToString(clone);
  const chartImg = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr));
  const W = cw + PAD * 2;
  const H = PAD + HEADER + ch + LEGEND + FOOTER;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  await Promise.all([
    document.fonts.load("700 26px 'Space Grotesk'"),
    document.fonts.load("700 14px 'Public Sans'"),
  ]).catch(() => {});

  // ── Background (theme-aware so the chart's colors match) ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (isDark) { bg.addColorStop(0, "#101828"); bg.addColorStop(1, "#0A0F1B"); }
  else        { bg.addColorStop(0, "#FBFBFC"); bg.addColorStop(1, "#EEF0F4"); }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const titleColor = isDark ? "#EDF2FA" : "#0C1220";
  const mutedColor = isDark ? "#5E6D87" : "#8A93A6";

  // ── Header: company logo + "Company — Chart" ──
  let textX = PAD;
  try {
    const clogo = await loadImage(`/api/logo/${encodeURIComponent(opts.ticker)}`);
    const tile = 46, ty = PAD;
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.roundRect(PAD, ty, tile, tile, 11); ctx.fill();
    ctx.beginPath(); ctx.roundRect(PAD, ty, tile, tile, 11); ctx.clip();
    const inset = 8, box = tile - inset * 2;
    const ar = (clogo.width || 1) / (clogo.height || 1);
    let dw = box, dh = box;
    if (ar > 1) dh = box / ar; else dw = box * ar;
    ctx.drawImage(clogo, PAD + (tile - dw) / 2, ty + (tile - dh) / 2, dw, dh);
    ctx.restore();
    textX = PAD + tile + 16;
  } catch { /* no logo — title just starts at the edge */ }

  ctx.font = "700 26px 'Space Grotesk', sans-serif";
  ctx.fillStyle = titleColor;
  ctx.textBaseline = "alphabetic";
  const head = `${opts.companyName ?? opts.ticker}  —  ${opts.title}`;
  ctx.fillText(head, textX, PAD + 31);

  // ── Chart ──
  const chartY = PAD + HEADER;
  ctx.drawImage(chartImg, PAD, chartY, cw, ch);

  // ── Legend (recharts renders it as HTML, so redraw it here) ──
  if (legend.length) {
    ctx.font = "600 14px 'Public Sans', sans-serif";
    const gap = 18, sw = 14;
    const widths = legend.map(l => sw + 6 + ctx.measureText(l.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (legend.length - 1);
    let lx = (W - total) / 2;
    const ly = chartY + ch + 26;
    legend.forEach((l, i) => {
      ctx.fillStyle = l.color;
      ctx.beginPath(); ctx.roundRect(lx, ly - 10, sw, 12, 3); ctx.fill();
      ctx.fillStyle = titleColor;
      ctx.fillText(l.text, lx + sw + 6, ly);
      lx += widths[i] + gap;
    });
  }

  // ── Footer: "Powered by" + Prometheon wordmark ──
  try {
    const mark = await loadImage(isDark ? "/logo_transparent.png" : "/logo_transparent_dark.png");
    const mw = 128, mh = mw * (605 / 1953);
    const my = H - FOOTER + (FOOTER - mh) / 2 - 2;
    ctx.font = "700 13px 'Public Sans', sans-serif";
    ctx.fillStyle = mutedColor;
    const pb = "POWERED BY";
    const pbw = ctx.measureText(pb).width;
    const markX = W - PAD - mw;
    ctx.fillText(pb, markX - pbw - 12, my + mh / 2 + 4);
    ctx.drawImage(mark, markX, my, mw, mh);
  } catch { /* skip footer mark */ }

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export default function ChartShotButton({ ticker, companyName }: { ticker: string; companyName?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "copied" | "saved">("idle");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  // Locate this section's chart + title + legend, then rasterize it
  async function generate(): Promise<{ blob: Blob; title: string } | null> {
    if (!ref.current) return null;
    const labelEl = ref.current.closest("[data-chart-section]");
    let sib = labelEl?.nextElementSibling ?? null;
    let card: Element | null = null;
    while (sib) {
      if (sib.querySelector?.(".recharts-surface")) { card = sib; break; }
      sib = sib.nextElementSibling;
    }
    const svg = card?.querySelector(".recharts-surface") as SVGSVGElement | null;
    if (!svg) return null;

    const title = (labelEl?.querySelector("[data-section-title]")?.textContent ?? "Chart").trim();

    const legend: { text: string; color: string }[] = [];
    card?.querySelectorAll(".recharts-legend-item").forEach((li) => {
      const text = li.querySelector(".recharts-legend-item-text")?.textContent?.trim();
      const sym = li.querySelector("path, rect, line, circle");
      const color = sym ? (window.getComputedStyle(sym).fill || window.getComputedStyle(sym).stroke) : null;
      if (text) legend.push({ text, color: color && color !== "none" ? color : "#888" });
    });

    const blob = await captureChart(svg, legend, { title, ticker, companyName });
    return { blob, title };
  }

  async function handleCopy() {
    setOpen(false); setState("busy");
    try {
      const res = await generate();
      setState(res && (await copyImageToClipboard(res.blob)) ? "copied" : "idle");
    } catch { setState("idle"); }
    setTimeout(() => setState("idle"), 2000);
  }

  async function handleSave() {
    setOpen(false); setState("busy");
    try {
      const res = await generate();
      if (!res) { setState("idle"); return; }
      const filename = `${ticker}-${res.title.replace(/[^A-Za-z0-9]+/g, "-")}.png`;
      const result = await saveImage(res.blob, filename);
      setState(result === "cancelled" ? "idle" : "saved");
    } catch { setState("idle"); }
    setTimeout(() => setState("idle"), 2000);
  }

  const done = state === "copied" || state === "saved";
  const saveLabel = prefersNativeShare() ? "Save to Photos" : "Download";

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Screenshot this chart"
        aria-label="Screenshot this chart"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px", borderRadius: 999, cursor: "pointer", flexShrink: 0,
          background: done ? "var(--positive)" : "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: done ? "#08120A" : "var(--text-secondary)",
          fontFamily: "'Public Sans', sans-serif", fontSize: "0.6rem", fontWeight: 700,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
        {state === "busy" ? "…" : state === "copied" ? "Copied ✓" : state === "saved" ? "Saved ✓" : "PNG"}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 300,
          background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 14,
          padding: 5, minWidth: 160, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
        }}>
          <ChartMenuItem label="Copy Image" onClick={handleCopy} />
          <ChartMenuItem label={saveLabel} onClick={handleSave} />
        </div>
      )}
    </div>
  );
}

function ChartMenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 9,
        background: "transparent", border: "none", cursor: "pointer",
        fontFamily: "'Public Sans', sans-serif", fontSize: "0.76rem", fontWeight: 500,
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}
