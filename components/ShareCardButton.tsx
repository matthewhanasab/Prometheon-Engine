"use client";
import { useState, useRef, useEffect } from "react";
import { copyImageToClipboard, saveImage, prefersNativeShare } from "./shareImage";

interface ShareStock {
  ticker: string;
  name?: string;
  sector?: string;
  price?: number | null;
  change?: number | null;
  changePct?: number | null;
  mktCap?: number | null;
  week52High?: number | null;
  week52Low?: number | null;
  peRatio?: number | null;
  analystTarget?: number | null;
}

interface Props {
  stock: ShareStock;
  window: { date: string; price: number }[]; // chart window (already range-sliced)
  rangeLabel: string;
  stats?: [string, string][]; // optional override for the bottom stat strip (ETFs, etc.)
}

const fmtBig = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6)  return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(2)}`;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function drawCard({ stock, window: win, rangeLabel, stats: customStats }: Props): Promise<Blob> {
  const W = 1200, H = 675, SCALE = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);

  // Card fonts come from the page's already-loaded families
  await Promise.all([
    document.fonts.load("700 60px 'Spline Sans Mono'"),
    document.fonts.load("600 40px 'Space Grotesk'"),
    document.fonts.load("700 15px 'Public Sans'"),
  ]).catch(() => {});

  // ── Background: brand dark navy with soft accent glows ──
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#101828");
  bg.addColorStop(1, "#0A0F1B");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 150, 90, 0, W - 150, 90, 500);
  glow.addColorStop(0, "rgba(107,156,255,0.16)");
  glow.addColorStop(1, "rgba(107,156,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const PAD = 56;

  // ── Logo (white-text wordmark for the dark card) ──
  try {
    const logo = await loadImage("/logo_transparent.png");
    const lw = 288, lh = lw * (605 / 1953);
    ctx.drawImage(logo, PAD, 42, lw, lh);
  } catch { /* card still works without the logo */ }

  // Company logo — white rounded tile, top right (1000x-style branding)
  try {
    const clogo = await loadImage(`/api/logo/${encodeURIComponent(stock.ticker)}`);
    const tile = 156, tx = W - PAD - tile, ty = 28;
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, 32); ctx.fill();
    ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, 32); ctx.clip();
    const inset = 26, box = tile - inset * 2;
    const ar = (clogo.width || 1) / (clogo.height || 1);
    let dw = box, dh = box;
    if (ar > 1) dh = box / ar; else dw = box * ar;
    ctx.drawImage(clogo, tx + (tile - dw) / 2, ty + (tile - dh) / 2, dw, dh);
    ctx.restore();
  } catch { /* no logo for this ticker — card still renders */ }

  // ── Company + ticker ──
  ctx.fillStyle = "#EDF2FA";
  ctx.font = "600 42px 'Space Grotesk'";
  const name = stock.name ?? stock.ticker;
  ctx.fillText(name.length > 34 ? name.slice(0, 33) + "…" : name, PAD, 178);
  ctx.font = "700 21px 'Spline Sans Mono'";
  ctx.fillStyle = "#6B9CFF";
  const tickerText = stock.ticker + (stock.sector ? `  ·  ${stock.sector.toUpperCase()}` : "");
  ctx.fillText(tickerText, PAD, 210);

  // ── Price + day change ──
  const up = (stock.changePct ?? 0) >= 0;
  ctx.fillStyle = "#EDF2FA";
  ctx.font = "700 58px 'Spline Sans Mono'";
  const priceText = stock.price != null ? `$${stock.price.toFixed(2)}` : "—";
  ctx.fillText(priceText, PAD, 268);
  const pw = ctx.measureText(priceText).width;
  ctx.font = "600 26px 'Spline Sans Mono'";
  ctx.fillStyle = up ? "#4ADE80" : "#F87171";
  if (stock.change != null && stock.changePct != null) {
    ctx.fillText(
      `${up ? "▲" : "▼"} ${up ? "+" : ""}${stock.change.toFixed(2)} (${up ? "+" : ""}${stock.changePct.toFixed(2)}%)`,
      PAD + pw + 22, 262
    );
  }

  // ── Chart ──
  const CX = PAD, CY = 300, CW = W - PAD * 2, CH = 250;
  const pts = win.length > 320 ? win.filter((_, i) => i % Math.ceil(win.length / 320) === 0) : win;
  if (pts.length > 1) {
    const vals = pts.map(p => p.price);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    const xy = (i: number) => [
      CX + (i / (pts.length - 1)) * CW,
      CY + CH - ((pts[i].price - lo) / span) * (CH - 24) - 12,
    ] as const;

    // grid
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    for (let g = 0; g <= 3; g++) {
      const gy = CY + (g / 3) * CH;
      ctx.beginPath(); ctx.moveTo(CX, gy); ctx.lineTo(CX + CW, gy); ctx.stroke();
    }
    ctx.setLineDash([]);

    const winUp = pts[pts.length - 1].price >= pts[0].price;
    const lineColor = winUp ? "#4ADE80" : "#F87171";

    // area fill
    const fill = ctx.createLinearGradient(0, CY, 0, CY + CH);
    fill.addColorStop(0, winUp ? "rgba(74,222,128,0.22)" : "rgba(248,113,113,0.22)");
    fill.addColorStop(1, "rgba(0,0,0,0)");
    ctx.beginPath();
    ctx.moveTo(...xy(0));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(...xy(i));
    ctx.lineTo(CX + CW, CY + CH); ctx.lineTo(CX, CY + CH); ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(...xy(0));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(...xy(i));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.stroke();

    // end dot
    const [ex, ey] = xy(pts.length - 1);
    ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2);
    ctx.fillStyle = lineColor; ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, 11, 0, Math.PI * 2);
    ctx.fillStyle = winUp ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"; ctx.fill();

    // range % badge over the chart
    const pct = ((pts[pts.length - 1].price - pts[0].price) / pts[0].price) * 100;
    ctx.font = "700 24px 'Spline Sans Mono'";
    const badge = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}% ${rangeLabel}`;
    ctx.fillStyle = lineColor;
    ctx.fillText(badge, CX + 4, CY + 18);

    // hi/lo labels right side
    ctx.font = "500 15px 'Spline Sans Mono'";
    ctx.fillStyle = "#5E6D87";
    ctx.textAlign = "right";
    ctx.fillText(`$${hi.toFixed(2)}`, CX + CW, CY + 10);
    ctx.fillText(`$${lo.toFixed(2)}`, CX + CW, CY + CH - 2);
    // date range labels
    ctx.textAlign = "left";
    ctx.fillText(pts[0].date, CX, CY + CH + 22);
    ctx.textAlign = "right";
    ctx.fillText(pts[pts.length - 1].date, CX + CW, CY + CH + 22);
    ctx.textAlign = "left";
  }

  // ── Stats row (caller can override, e.g. ETFs) ──
  const stats: [string, string][] = customStats ?? [
    ["52-WK HIGH", stock.week52High != null ? `$${stock.week52High.toFixed(2)}` : "—"],
    ["52-WK LOW", stock.week52Low != null ? `$${stock.week52Low.toFixed(2)}` : "—"],
    ["MKT CAP", fmtBig(stock.mktCap)],
    ["TTM P/E", stock.peRatio != null ? `${stock.peRatio.toFixed(1)}×` : "—"],
    ["ANALYST TARGET", stock.analystTarget != null ? `$${stock.analystTarget.toFixed(2)}` : "—"],
  ];
  const SY = 610, colW = (W - PAD * 2) / stats.length;
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(PAD, SY - 34); ctx.lineTo(W - PAD, SY - 34); ctx.stroke();
  stats.forEach(([label, value], i) => {
    const x = PAD + i * colW;
    ctx.font = "700 12px 'Public Sans'";
    ctx.fillStyle = "#5E6D87";
    ctx.fillText(label, x, SY - 8);
    ctx.font = "600 22px 'Spline Sans Mono'";
    ctx.fillStyle = "#EDF2FA";
    ctx.fillText(value, x, SY + 20);
  });

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export default function ShareCardButton(props: Props) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "saved">("idle");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const filename = `${props.stock.ticker}-prometheon.png`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); window.removeEventListener("keydown", onKey); };
  }, [open]);

  async function handleCopy() {
    setOpen(false); setState("busy");
    try {
      const blob = await drawCard(props);
      setState((await copyImageToClipboard(blob)) ? "copied" : "idle");
    } catch { setState("idle"); }
    setTimeout(() => setState("idle"), 2200);
  }

  async function handleSave() {
    setOpen(false); setState("busy");
    try {
      const blob = await drawCard(props);
      const result = await saveImage(blob, filename);
      setState(result === "cancelled" ? "idle" : "saved");
    } catch { setState("idle"); }
    setTimeout(() => setState("idle"), 2200);
  }

  const done = state === "copied" || state === "saved";
  const busy = state === "busy";
  const tip = busy ? "Rendering…" : state === "copied" ? "Copied ✓" : state === "saved" ? (prefersNativeShare() ? "Saved ✓" : "Downloaded ✓") : "Copy or save a share-ready image of this stock";
  const saveLabel = prefersNativeShare() ? "Save to Photos" : "Download";

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={tip}
        aria-label="Screenshot this stock"
        aria-expanded={open}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, padding: 0, borderRadius: 999, cursor: "pointer", flexShrink: 0,
          background: done ? "var(--positive)" : "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: done ? "#08120A" : "var(--text-secondary)",
          opacity: busy ? 0.6 : 1,
          transition: "background 0.15s ease, color 0.15s ease",
        }}
      >
        {done ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 300,
          background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 14,
          padding: 5, minWidth: 168, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
        }}>
          <MenuItem label="Copy Image" onClick={handleCopy} />
          <MenuItem label={saveLabel} onClick={handleSave} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 9,
        background: "transparent", border: "none", cursor: "pointer",
        fontFamily: "'Public Sans', sans-serif", fontSize: "0.78rem", fontWeight: 500,
        color: "var(--text-primary)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}
