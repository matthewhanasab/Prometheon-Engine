const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_KEY!;

export function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return "N/A";
  return n.toFixed(decimals);
}
export function fmtLarge(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}
export function fmtPct(n: number | null | undefined, alreadyPct = false): string {
  if (n == null || isNaN(n)) return "N/A";
  return `${(alreadyPct ? n : n * 100).toFixed(2)}%`;
}

async function get(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function getFullStockData(ticker: string) {
  const t = ticker.toUpperCase();

  const [profile, quote, metrics, estimates, grades, incomeRaw, balanceRaw, cashFlowRaw] = await Promise.all([
    get(`/profile`,                { symbol: t }),
    get(`/quote`,                  { symbol: t }),
    get(`/key-metrics-ttm`,        { symbol: t }),
    get(`/analyst-estimates`,      { symbol: t, period: "annual", limit: "10" }),
    get(`/grades`,                 { symbol: t, limit: "50" }),
    get(`/income-statement`,       { symbol: t, limit: "2" }),
    get(`/balance-sheet-statement`,{ symbol: t, limit: "1" }),
    get(`/cash-flow-statement`,    { symbol: t, limit: "1" }),
  ]);

  const p    = profile?.[0]   ?? {};
  const q    = quote?.[0]     ?? {};
  const m    = metrics?.[0]   ?? {};
  const inc  = incomeRaw?.[0] ?? {};
  const inc1 = incomeRaw?.[1] ?? {};
  const bal  = balanceRaw?.[0] ?? {};
  const cf   = cashFlowRaw?.[0] ?? {};

  // ── Analyst grades → buy/hold/sell buckets ──
  const buyKw  = ["buy", "outperform", "overweight", "strong buy", "accumulate"];
  const sellKw = ["sell", "underperform", "underweight", "strong sell", "reduce"];
  let buy = 0, hold = 0, sell = 0;
  for (const g of (grades ?? [])) {
    const gr = (g.newGrade ?? "").toLowerCase();
    if (buyKw.some(k => gr.includes(k)))  buy++;
    else if (sellKw.some(k => gr.includes(k))) sell++;
    else hold++;
  }

  // ── Core prices ──
  const price    = q.price ?? p.price ?? null;
  const change   = q.change ?? null;
  const chgPctRaw = q.changesPercentage ?? (change && price ? (change / (price - change)) * 100 : null);

  // ── Dividend ──
  const lastDiv  = p.lastDividend ?? 0;
  const divYield = price && lastDiv ? lastDiv / price : null;

  // ── From income statement ──
  const revenue      = inc.revenue      ?? null;
  const grossProfit  = inc.grossProfit  ?? null;
  const operatingInc = inc.operatingIncome ?? null;
  const netIncome    = inc.netIncome    ?? null;
  const prevRevenue  = inc1.revenue     ?? null;
  const revenueGrowth = (revenue && prevRevenue && prevRevenue !== 0)
    ? (revenue - prevRevenue) / Math.abs(prevRevenue)
    : null;
  // EPS: income statement has it directly
  const eps = inc.epsDiluted ?? inc.eps ?? q.eps ?? null;

  // ── From balance sheet ──
  const totalDebt    = bal.totalDebt    ?? 0;
  const totalEquity  = bal.totalStockholdersEquity ?? bal.totalEquity ?? null;
  const cashAndEq    = bal.cashAndCashEquivalents ?? p.cashAndCashEquivalents ?? 0;
  // Net debt against ALL liquid holdings — cash plus short-term investments.
  // (FMP's own netDebt ignores marketable securities, which turns NVDA's ~$68B
  // net-cash position into a rounding error.)
  const liquidAssets = bal.cashAndShortTermInvestments
    ?? (cashAndEq + (bal.shortTermInvestments ?? 0));
  const netDebt      = totalDebt - liquidAssets;

  // ── From cash flow ──
  const operatingCF  = cf.operatingCashFlow  ?? cf.netCashProvidedByOperatingActivities ?? null;
  const freeCF       = cf.freeCashFlow       ?? (operatingCF && cf.capitalExpenditure ? operatingCF + cf.capitalExpenditure : null);

  // ── Derived ratios ──
  const mktCap       = q.marketCap ?? p.mktCap ?? null;
  const grossMargin  = revenue && grossProfit  ? grossProfit  / revenue : null;
  const opMargin     = revenue && operatingInc ? operatingInc / revenue : null;
  const netMargin    = revenue && netIncome    ? netIncome    / revenue : null;
  const debtEquity   = totalEquity && totalEquity > 0 ? totalDebt / totalEquity : null;
  const currentRatio = m.currentRatioTTM ?? null;
  const ps           = mktCap && revenue ? mktCap / revenue : null;
  const pb           = price && totalEquity ? (mktCap ?? 0) / totalEquity : null;
  const pFcf         = mktCap && freeCF && freeCF > 0 ? mktCap / freeCF : null;
  const fcfYield     = mktCap && freeCF && mktCap > 0 ? freeCF / mktCap * 100 : null;
  const roe          = m.returnOnEquityTTM ?? null;
  const roic         = m.returnOnInvestedCapitalTTM ?? null;
  const eyield       = m.earningsYieldTTM ?? null;
  const peRatio      = eyield && eyield > 0 ? 1 / eyield : (q.pe ?? null);

  // ── Forward estimates ──
  // FMP returns annual estimates furthest-year-first; pick the NEAREST upcoming fiscal year
  const today = new Date().toISOString().slice(0, 10);
  const futureEsts = (Array.isArray(estimates) ? estimates : [])
    .filter((e: any) => e?.date >= today)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));
  const est0     = futureEsts[0] ?? {};
  const fwdEps   = est0.epsAvg    ?? null;
  const fwdPE    = price && fwdEps && fwdEps > 0 ? price / fwdEps : null;
  const fwdRevenue = est0.revenueAvg ?? null;

  // Analyst target comes from Finnhub via the API route — set null here, merged there
  const analystTarget: number | null = null;

  // ── EPS growth (TTM vs Fwd) ──
  const epsGrowth = eps && fwdEps && eps !== 0 ? (fwdEps - eps) / Math.abs(eps) : null;

  // ── PEG ──
  const epsGrowthPct = epsGrowth ? epsGrowth * 100 : null;
  const peg = peRatio && epsGrowthPct && epsGrowthPct > 0 ? peRatio / epsGrowthPct : null;

  return {
    // Identity
    ticker: t,
    name:       p.companyName ?? t,
    sector:     p.sector      ?? null,
    industry:   p.industry    ?? null,
    exchange:   p.exchange    ?? null,
    description: p.description ?? null,

    // Price
    price,
    change,
    changePct:      chgPctRaw,
    changePositive: (change ?? 0) >= 0,
    week52High:     q.yearHigh ?? null,
    week52Low:      q.yearLow  ?? null,
    volume:         q.volume   ?? null,
    avgVolume:      q.avgVolume ?? null,
    beta:           p.beta     ?? null,
    mktCap,
    analystTarget,
    analystBuy: buy, analystHold: hold, analystSell: sell,

    // Valuation
    peRatio,
    fwdPE,
    eps,
    fwdEps,
    epsGrowth,
    revenueGrowth,
    ps,
    pb,
    peg,
    pFcf,
    fcfYield,

    // Revenue & margins
    revenue,
    grossMargin,
    opMargin,
    netMargin,

    // Returns & quality
    roe,
    roic,
    divYield,
    lastDiv,

    // Balance sheet / cash flow
    debtEquity,
    currentRatio,
    netDebt,
    operatingCF,
    freeCF,
    totalEquity,

    // Forward estimates
    estimates: (estimates ?? []).map((e: any) => ({
      date:        e.date,
      revenueAvg:  e.revenueAvg  ?? null,
      revenueLow:  e.revenueLow  ?? null,
      revenueHigh: e.revenueHigh ?? null,
      epsAvg:      e.epsAvg      ?? null,
      epsLow:      e.epsLow      ?? null,
      epsHigh:     e.epsHigh     ?? null,
      numAnalysts: e.numAnalystsEps ?? null,
    })).filter((e: any) => e.date),
  };
}

export async function getPriceHistory(ticker: string, days = 365) {
  const data = await get(`/historical-price-eod/light`, {
    symbol: ticker.toUpperCase(),
    limit: String(days),
  });
  if (!data) return [];
  return (data as any[]).map((d: any) => ({
    date:  d.date,
    price: d.price ?? d.close ?? d.adjClose ?? 0,
  })).reverse();
}

export async function getEarnings(ticker: string) {
  const data = await get(`/earnings`, { symbol: ticker.toUpperCase(), limit: "8" });
  if (!data) return [];
  return (data as any[]).map((d: any) => {
    const actual   = d.epsActual    ?? d.eps      ?? null;
    const estimate = d.epsEstimated ?? d.estimate ?? null;
    // FMP sometimes gives surprisePercentage as a decimal (e.g. 0.05 = 5%)
    let surprise: number | null = d.surprisePercentage ?? d.surprise ?? null;
    if (surprise == null && actual != null && estimate != null && estimate !== 0) {
      surprise = ((actual - estimate) / Math.abs(estimate)) * 100;
    } else if (surprise != null && Math.abs(surprise) < 2) {
      // field is in decimal form — convert to %
      surprise = surprise * 100;
    }
    return {
      date:     d.date ?? d.reportedDate,
      actual,
      estimate,
      surprise,
    };
  });
}
