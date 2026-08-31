// Forward-looking estimates.
//
// IMPORTANT — provenance. There is no analyst-consensus EPS feed in our data
// stack: marketstack exposes no estimates route (probed: estimates,
// analystestimates, earningsestimates, forecasts, consensus — all 404), EDGAR
// carries only as-filed actuals, and TradingView data can't be extracted from
// its iframes. So "forward EPS" here is NOT Wall Street consensus.
//
// What this module does instead is project the company's own reported earnings
// trajectory forward, and label it as exactly that. Every consumer must present
// it as a trend projection, never as consensus.
//
// The one genuinely forward-looking *analyst* input we do license is the
// price-target block from marketstack's companyratings (average/high/low target
// and its target_date) — that stays sourced separately and is not modelled here.

export type ForwardEstimate = {
  /** Blended annual growth rate actually applied (decimal, e.g. 0.18 = 18%). */
  growth: number;
  /** Next-twelve-month EPS projection. */
  eps: number;
  /** Year-two EPS projection. */
  eps2y: number | null;
  /** Price / projected NTM EPS. */
  pe: number | null;
  /** Forward PE relative to the growth rate driving it. */
  peg: number | null;
  /** How much the trailing multiple compresses on the projection, in percent. */
  peCompressionPct: number | null;
  /** Component growth signals that fed the blend, for transparency in the UI. */
  inputs: { label: string; growth: number; weight: number }[];
  /** "high" when the signals agree, "low" when they conflict or are sparse. */
  confidence: "high" | "medium" | "low";
  basis: string;
};

type Signals = {
  /** Most recent quarter's EPS vs the same quarter a year earlier. */
  currentQuarterEpsGrowth?: number | null;
  /** TTM EPS vs prior TTM EPS. */
  epsGrowth?: number | null;
  /** Last completed fiscal year vs the one before. */
  lastYearEpsGrowth?: number | null;
};

// Growth signals are blended most-recent-first: the latest quarter carries the
// freshest information, the TTM comparison smooths it, and the last full year
// anchors it. Weights are renormalised over whichever signals exist.
const WEIGHTS: { key: keyof Signals; label: string; weight: number }[] = [
  { key: "currentQuarterEpsGrowth", label: "Latest quarter YoY", weight: 0.5 },
  { key: "epsGrowth", label: "TTM vs prior TTM", weight: 0.3 },
  { key: "lastYearEpsGrowth", label: "Last fiscal year", weight: 0.2 },
];

// Earnings growth reverts toward the mean hard; carrying a hot rate forward
// undamped produces absurd targets. The haircut and the clamp keep the
// projection inside the range real businesses actually sustain.
const DAMPING = 0.7;
const MIN_GROWTH = -0.4;
const MAX_GROWTH = 0.5;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Project EPS and the resulting multiple forward from a company's own reported
 * growth. Returns null when there's no usable EPS base or no growth signal —
 * callers should then show "not available with current data" rather than a
 * fabricated number.
 */
export function forwardEstimate(
  price: number | null | undefined,
  ttmEps: number | null | undefined,
  signals: Signals
): ForwardEstimate | null {
  if (!isNum(ttmEps) || ttmEps <= 0) return null; // no meaningful base to grow

  const inputs: { label: string; growth: number; weight: number }[] = [];
  let weighted = 0;
  let totalWeight = 0;
  for (const { key, label, weight } of WEIGHTS) {
    const g = signals[key];
    // Guard against the >10x swings that come out of a near-zero prior base.
    if (!isNum(g) || Math.abs(g) > 3) continue;
    inputs.push({ label, growth: g, weight });
    weighted += g * weight;
    totalWeight += weight;
  }
  if (!totalWeight) return null;

  const blended = weighted / totalWeight;
  const growth = Math.max(MIN_GROWTH, Math.min(MAX_GROWTH, blended * DAMPING));

  const eps = ttmEps * (1 + growth);
  const eps2y = eps > 0 ? eps * (1 + growth) : null;
  const pe = isNum(price) && eps > 0 ? price / eps : null;
  const trailingPe = isNum(price) ? price / ttmEps : null;
  const peg = pe != null && growth > 0 ? pe / (growth * 100) : null;
  const peCompressionPct =
    pe != null && trailingPe != null && trailingPe > 0 ? (pe / trailingPe - 1) * 100 : null;

  // Agreement between the signals is the honest confidence proxy: a wide spread
  // means the quarter, the TTM and the year are telling different stories.
  const spread = inputs.length > 1
    ? Math.max(...inputs.map((i) => i.growth)) - Math.min(...inputs.map((i) => i.growth))
    : Infinity;
  const confidence: ForwardEstimate["confidence"] =
    inputs.length >= 3 && spread < 0.25 ? "high"
    : inputs.length >= 2 && spread < 0.6 ? "medium"
    : "low";

  return {
    growth,
    eps,
    eps2y,
    pe,
    peg,
    peCompressionPct,
    inputs,
    confidence,
    basis: "Prometheon trend model — projected from SEC-filed results, not analyst consensus.",
  };
}

// ── Revenue ──────────────────────────────────────────────────────────────────
//
// Same shape as the EPS projection above, and the same warning: this is the
// company's own trajectory carried forward, NOT analyst consensus. Consensus
// revenue isn't published free anywhere — Nasdaq's forecast rows carry EPS
// only, its revenue endpoint returns historical actuals, and the feeds that do
// carry it are paid. So where forward P/E can quote real estimates, anything
// revenue-forward is a projection and has to be labelled as one.
//
// It earns its place because the alternative is a blank row on every
// loss-making company. Forward P/S can be derived from consensus EPS and net
// margin while margin is positive, but that identity breaks exactly when it's
// most interesting — IREN's TTM margin is -99%, so a margin-based forward P/S
// would come out negative. Revenue keeps growing through losses, so projecting
// it covers the cases the identity can't.
//
// Tuned apart from earnings deliberately: revenue is far stickier than EPS, so
// it's damped less, and the ceiling is higher because young companies genuinely
// compound revenue at rates no mature earnings base sustains.
export type RevenueProjection = {
  /** Blended annual revenue growth applied (decimal). */
  growth: number;
  /** Next-twelve-month revenue projection. */
  revenue: number;
  inputs: { label: string; growth: number; weight: number }[];
  confidence: "high" | "medium" | "low";
  basis: string;
};

type RevSignals = {
  currentQuarterRevGrowth?: number | null;
  revenueGrowth?: number | null;
  lastYearRevGrowth?: number | null;
};

const REV_WEIGHTS: { key: keyof RevSignals; label: string; weight: number }[] = [
  { key: "currentQuarterRevGrowth", label: "Latest quarter YoY", weight: 0.5 },
  { key: "revenueGrowth", label: "TTM vs prior TTM", weight: 0.3 },
  { key: "lastYearRevGrowth", label: "Last fiscal year", weight: 0.2 },
];

const REV_DAMPING = 0.85;
const REV_MIN_GROWTH = -0.4;
const REV_MAX_GROWTH = 1.0;

export function revenueProjection(
  ttmRevenue: number | null | undefined,
  signals: RevSignals
): RevenueProjection | null {
  if (!isNum(ttmRevenue) || ttmRevenue <= 0) return null;

  const inputs: { label: string; growth: number; weight: number }[] = [];
  let weighted = 0;
  let totalWeight = 0;
  for (const { key, label, weight } of REV_WEIGHTS) {
    const g = signals[key];
    // Same guard as earnings: a near-zero prior base produces meaningless rates.
    if (!isNum(g) || Math.abs(g) > 3) continue;
    inputs.push({ label, growth: g, weight });
    weighted += g * weight;
    totalWeight += weight;
  }
  if (!totalWeight) return null;

  const blended = weighted / totalWeight;
  const growth = Math.max(REV_MIN_GROWTH, Math.min(REV_MAX_GROWTH, blended * REV_DAMPING));

  const spread = inputs.length > 1
    ? Math.max(...inputs.map((i) => i.growth)) - Math.min(...inputs.map((i) => i.growth))
    : Infinity;
  const confidence: RevenueProjection["confidence"] =
    inputs.length >= 3 && spread < 0.25 ? "high"
    : inputs.length >= 2 && spread < 0.6 ? "medium"
    : "low";

  return {
    growth,
    revenue: ttmRevenue * (1 + growth),
    inputs,
    confidence,
    basis: "Prometheon trend model — projected from SEC-filed revenue, not analyst consensus.",
  };
}
