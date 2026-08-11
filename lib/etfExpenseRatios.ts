// Curated ETF expense ratios (net, % of assets per year).
//
// Why a static table: expense ratios come from a fund's prospectus, not from
// N-PORT (a holdings filing) or marketstack — there is no live feed for them in
// the current data stack. These are published, widely-known figures that change
// rarely (a fee cut makes news), so a maintained lookup for the ETFs people
// actually compare is accurate and honest. Anything not listed reports "—"
// rather than guessing.
//
// Last reviewed 2026-08. Source: each fund's official fact sheet / prospectus.
export const ETF_EXPENSE_RATIOS: Record<string, number> = {
  // Broad US
  VOO: 0.03, IVV: 0.03, SPY: 0.0945, VTI: 0.03, ITOT: 0.03, SPLG: 0.02,
  SCHB: 0.03, SCHX: 0.03, VV: 0.04,
  // Nasdaq / growth
  QQQ: 0.20, QQQM: 0.15, VUG: 0.04, SCHG: 0.04, IWF: 0.19, MGK: 0.07,
  // Value / dividend
  SCHD: 0.06, VYM: 0.06, VIG: 0.06, DGRO: 0.08, VTV: 0.04, IWD: 0.18,
  HDV: 0.08, SPYD: 0.07, DVY: 0.38, NOBL: 0.35, SDY: 0.35,
  // Total market / blend
  VT: 0.06, VXUS: 0.05, VEA: 0.03, VWO: 0.07, IEFA: 0.07, IEMG: 0.09,
  ACWI: 0.32, EFA: 0.32, EEM: 0.70,
  // Size / factor
  IWM: 0.19, VB: 0.05, VBR: 0.07, VBK: 0.07, IJR: 0.06, IJH: 0.05, VO: 0.04,
  // Sector
  XLK: 0.09, XLF: 0.09, XLE: 0.09, XLV: 0.09, XLY: 0.09, XLP: 0.09,
  XLI: 0.09, XLU: 0.09, XLB: 0.09, XLRE: 0.09, XLC: 0.09,
  SMH: 0.35, SOXX: 0.35, VGT: 0.09, VHT: 0.09, VDE: 0.09,
  // Bonds
  BND: 0.03, AGG: 0.03, BNDX: 0.07, TLT: 0.15, IEF: 0.15, SHY: 0.15,
  LQD: 0.14, HYG: 0.49, JNK: 0.40, MUB: 0.05, TIP: 0.19, VCIT: 0.04,
  // Thematic / active
  ARKK: 0.75, ARKG: 0.75, ARKW: 0.82, JEPI: 0.35, JEPQ: 0.35,
  SCHY: 0.08, COWZ: 0.49, DIVO: 0.56,
  // Gold / commodity
  GLD: 0.40, IAU: 0.25, GLDM: 0.10, SLV: 0.50,
};

export function expenseRatioFor(ticker: string): number | null {
  return ETF_EXPENSE_RATIOS[ticker.toUpperCase()] ?? null;
}
