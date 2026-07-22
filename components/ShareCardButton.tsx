"use client";
import { useState } from "react";

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

async function drawCard({ stock, window: win, rangeLabel }: Props): Promise<Blob> {
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
    const lw = 210, lh = lw * (605 / 1953);
    ctx.drawImage(logo, PAD, 40, lw, lh);
  } catch { /* card still works without the logo */ }

  // Company logo — white rounded tile, top right (1000x-style branding)
  try {
    const clogo = await loadImage(`/api/logo/${encodeURIComponent(stock.ticker)}`);
    const tile = 92, tx = W - PAD - tile, ty = 34;
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, 20); ctx.fill();
    ctx.beginPath(); ctx.roundRect(tx, ty, tile, tile, 20); ctx.clip();
    const inset = 15, box = tile - inset * 2;
    const ar = (clogo.width || 1) / (clogo.height || 1);
    let dw = box, dh = box;
    if (ar > 1) dh = box / ar; else dw = box * ar;
    ctx.drawImage(clogo, tx + (tile - dw) / 2, ty + (tile - dh) / 2, dw, dh);
    ctx.restore();
  } catch { /* no logo for this ticker — card still renders */ }

  // ── Company + ticker ──
  ctx.fillStyle = "#EDF2FA";
  ctx.font = "600 40px 'Space Grotesk'";
  const name = stock.name ?? stock.ticker;
  ctx.fillText(name.length > 38 ? name.slice(0, 37) + "…" : name, PAD, 165);
  ctx.font = "700 20px 'Spline Sans Mono'";
  ctx.fillStyle = "#6B9CFF";
  const tickerText = stock.ticker + (stock.sector ? `  ·  ${stock.sector.toUpperCase()}` : "");
  ctx.fillText(tickerText, PAD, 196);

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

  // ── Stats row ──
  const stats: [string, string][] = [
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

  // ── Footer URL ──
  ctx.font = "700 14px 'Public Sans'";
  ctx.fillStyle = "#6B9CFF";
  ctx.textAlign = "right";
  ctx.fillText("prometheonengine.com", W - PAD, H - 20);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png")
  );
}

export default function ShareCardButton(props: Props) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "downloaded">("idle");

  async function onClick() {
    if (state === "busy") return;
    setState("busy");
    try {
      const blob = await drawCard(props);
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setState("copied");
      } catch {
        // clipboard blocked → download instead
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${props.stock.ticker}-prometheon.png`;
        a.click();
        URL.revokeObjectURL(url);
        setState("downloaded");
      }
    } catch {
      setState("idle");
      return;
    }
    setTimeout(() => setState("idle"), 2200);
  }

  const label = state === "busy" ? "Rendering…" : state === "copied" ? "Copied ✓" : state === "downloaded" ? "Downloaded ✓" : "Screenshot";

  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy a share-ready image of this stock"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "8px 16px", borderRadius: 999, cursor: "pointer",
        background: state === "copied" || state === "downloaded" ? "var(--positive)" : "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: state === "copied" || state === "downloaded" ? "#08120A" : "var(--text-secondary)",
        fontFamily: "'Public Sans', sans-serif", fontSize: "0.7rem", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.08em",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
      {label}
    </button>
  );
}
