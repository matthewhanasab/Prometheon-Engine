// SEC EDGAR XBRL fundamentals.
//
// Why this exists: marketstack's Business plan advertises Company Statements /
// Facts / Concepts endpoints, but as of 2026-08 they return "Route not found".
// Every fundamentals-derived metric on the research page (P/E, margins, ROE,
// F-Score, Z-Score, DCF) needs income statement + balance sheet + cash flow, so
// we pull them straight from EDGAR — free, public domain, no license limit.
//
// Companies tag the same idea with different concepts across filers and eras,
// so each field resolves through an alias list, first match wins.

const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";
const FACTS_URL = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`;

type RawFact = {
  start?: string; end: string; val: number;
  fy?: number; fp?: string; form?: string; filed?: string; frame?: string;
};

export type Period = { end: string; start?: string; val: number; fy?: number; fp?: string };

const days = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Latest filing wins for a given period end — handles restatements/amendments. */
function dedupeByEnd(facts: RawFact[]): RawFact[] {
  const best = new Map<string, RawFact>();
  for (const f of facts) {
    const k = `${f.start ?? ""}|${f.end}`;
    const cur = best.get(k);
    if (!cur || String(f.filed ?? "") > String(cur.filed ?? "")) best.set(k, f);
  }
  return [...best.values()].sort((a, b) => a.end.localeCompare(b.end));
}

export class Facts {
  private us: Record<string, any>;
  private dei: Record<string, any>;
  constructor(json: any) {
    this.us = json?.facts?.["us-gaap"] ?? {};
    this.dei = json?.facts?.dei ?? {};
  }

  private raw(concept: string): RawFact[] {
    const node = this.us[concept] ?? this.dei[concept];
    if (!node?.units) return [];
    const unit = Object.keys(node.units)[0];
    const arr = node.units[unit];
    return Array.isArray(arr) ? arr.filter((f: any) => Number.isFinite(f?.val)) : [];
  }

  /**
   * Choose among aliases by recency, not list order.
   *
   * Filers migrate concepts mid-life and leave the old tag frozen in place:
   * NVIDIA stopped using RevenueFromContractWithCustomer in 2022 and moved to
   * Revenues, so first-match-wins reported $26.9B of revenue instead of $215.9B.
   * Whichever alias has the newest data point is the one the company is
   * actually using; fact count breaks ties.
   */
  private best(aliases: string[], keep: (x: RawFact) => boolean): Period[] {
    const candidates: RawFact[][] = [];
    let winner: RawFact[] | null = null;
    let winnerEnd = "";
    for (const c of aliases) {
      const f = dedupeByEnd(this.raw(c).filter(keep));
      if (!f.length) continue;
      candidates.push(f);
      const end = f[f.length - 1].end;
      if (!winner || end > winnerEnd || (end === winnerEnd && f.length > winner.length)) {
        winner = f;
        winnerEnd = end;
      }
    }
    if (!winner) return [];

    // Backfill history from superseded concepts.
    //
    // A migration can leave the current concept covering only a few periods:
    // NVIDIA moved short-term investments from MarketableSecuritiesCurrent to
    // DebtSecuritiesCurrent in early 2026, so the newest concept has two data
    // points and the older one has sixty-seven. Taking either alone leaves a
    // hole. Only dates strictly BEFORE the winner's first period are filled —
    // that is the migration signature. Gaps in the middle are left alone, since
    // there a second concept usually means something genuinely different (an
    // SG&A line filled in from a bare G&A line would understate it).
    const earliest = winner[0].end;
    const merged = new Map(winner.map((x) => [x.end, x]));
    for (const series of candidates) {
      if (series === winner) continue;
      for (const x of series) {
        if (x.end < earliest && !merged.has(x.end)) merged.set(x.end, x);
      }
    }

    return [...merged.values()]
      .sort((a, b) => a.end.localeCompare(b.end))
      .map((x) => ({ end: x.end, start: x.start, val: x.val, fy: x.fy, fp: x.fp }));
  }

  /** Annual (10-K, ~365-day) series. */
  annual(aliases: string[]): Period[] {
    return this.best(aliases, (x) => !!x.start && days(x.start!, x.end) > 330 && days(x.start!, x.end) < 400);
  }

  /** Quarterly (~90-day) series. */
  quarterly(aliases: string[]): Period[] {
    return this.best(aliases, (x) => !!x.start && days(x.start!, x.end) > 80 && days(x.start!, x.end) < 100);
  }

  /** Point-in-time (balance sheet) series, newest last. */
  instant(aliases: string[]): Period[] {
    return this.best(aliases, (x) => !x.start);
  }

  /** Most recent balance-sheet value. */
  latestInstant(aliases: string[]): number | null {
    const s = this.instant(aliases);
    return s.length ? s[s.length - 1].val : null;
  }

  /** Every duration fact for a concept, cumulative ones included. */
  private allDurations(aliases: string[]): Period[] {
    return this.best(
      aliases,
      (x) => !!x.start && days(x.start!, x.end) > 20 && days(x.start!, x.end) < 400
    );
  }

  /**
   * Discrete quarterly series, reconstructed from however the filer tagged it.
   *
   * Two separate problems have to be solved here:
   *
   * 1. Q4 is never filed on its own — it's folded into the 10-K, so a raw
   *    quarterly series has a hole every year.
   * 2. Cash-flow statements are tagged CUMULATIVE year-to-date and nothing
   *    else: 90d, 181d, 272d, 363d, all starting at the fiscal-year start.
   *    A naive "~90 day" filter therefore catches only Q1 each year — Apple's
   *    quarterly operating cash flow came back as 16 points spread over 17
   *    years before this was handled.
   *
   * Differencing consecutive facts that share a start date solves both at once
   * (Q3cum − Q2cum = discrete Q3; FY − Q3cum = discrete Q4). Natively-tagged
   * discrete quarters always win over a derived value.
   */
  quarterlyComplete(aliases: string[]): Period[] {
    const all = this.allDurations(aliases);
    if (!all.length) return [];
    const discrete = new Map<string, Period>();

    // 1. Natively discrete quarters.
    for (const p of all) {
      const d = days(p.start!, p.end);
      if (d > 80 && d < 100) discrete.set(p.end, p);
    }

    // 2. Difference cumulative runs sharing a fiscal-year start.
    const byStart = new Map<string, Period[]>();
    for (const p of all) {
      const arr = byStart.get(p.start!) ?? [];
      arr.push(p);
      byStart.set(p.start!, arr);
    }
    for (const group of byStart.values()) {
      const sorted = [...group].sort((a, b) => a.end.localeCompare(b.end));
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1], cur = sorted[i];
        const span = days(prev.end, cur.end);
        if (span < 80 || span > 100) continue;
        if (discrete.has(cur.end)) continue;
        discrete.set(cur.end, { start: prev.end, end: cur.end, val: cur.val - prev.val, fp: cur.fp });
      }
    }

    // 3. Last resort for filers that tag discrete quarters but no cumulative
    //    run: Q4 = FY − (Q1 + Q2 + Q3).
    for (const yr of this.annual(aliases)) {
      if (discrete.has(yr.end)) continue;
      const inside = [...discrete.values()].filter((x) => x.start! >= yr.start! && x.end <= yr.end);
      if (inside.length !== 3) continue;
      const covered = inside.reduce((s, x) => s + x.val, 0);
      discrete.set(yr.end, {
        start: inside[inside.length - 1].end,
        end: yr.end,
        val: yr.val - covered,
        fp: "Q4",
      });
    }

    return [...discrete.values()].sort((x, y) => x.end.localeCompare(y.end));
  }

  private ttmAt(aliases: string[], offset: number): number | null {
    const q = this.quarterlyComplete(aliases);
    if (q.length >= 4 + offset) {
      const end = q.length - offset;
      const win = q.slice(end - 4, end);
      const span = days(win[0].start!, win[3].end);
      if (span > 330 && span < 400) return win.reduce((s, x) => s + x.val, 0);
    }
    const a = this.annual(aliases);
    const idx = a.length - 1 - (offset ? 1 : 0);
    return idx >= 0 ? a[idx]?.val ?? null : null;
  }

  /** Trailing twelve months for a flow concept. */
  ttm(aliases: string[]): number | null {
    return this.ttmAt(aliases, 0);
  }

  /** TTM as of one year earlier — used for YoY trend checks. */
  ttmPrior(aliases: string[]): number | null {
    return this.ttmAt(aliases, 4);
  }

  /** Balance-sheet value roughly one year before the latest. */
  instantPrior(aliases: string[]): number | null {
    const s = this.instant(aliases);
    if (s.length < 2) return null;
    const latest = s[s.length - 1];
    return this.instantAt(aliases, new Date(Date.parse(latest.end) - 365 * 864e5).toISOString().slice(0, 10), s.slice(0, -1));
  }

  /** Balance-sheet value at (or nearest to) a date — used to align with fiscal year ends. */
  instantAt(aliases: string[], date: string, pool?: Period[]): number | null {
    const s = pool ?? this.instant(aliases);
    if (!s.length) return null;
    const target = Date.parse(date);
    let best: Period | null = null;
    let bestGap = Infinity;
    for (const p of s) {
      const gap = Math.abs(Date.parse(p.end) - target);
      if (gap < bestGap) { bestGap = gap; best = p; }
    }
    return best && bestGap < 120 * 864e5 ? best.val : null;
  }

  /**
   * Sum several concepts as of one balance-sheet date (e.g. all debt tranches).
   *
   * Each tranche must be reported at (or within a quarter of) `asOf`. Without
   * that guard a line a filer stopped reporting years ago still contributes:
   * Apple last tagged OtherShortTermBorrowings in 2020, and blindly taking each
   * concept's latest value added that stale $11B to today's debt.
   */
  sumInstant(conceptGroups: string[][], asOf: string): number | null {
    let total = 0;
    let found = false;
    const cutoff = Date.parse(asOf) - 100 * 864e5;
    for (const g of conceptGroups) {
      const s = this.instant(g);
      if (!s.length) continue;
      const p = s[s.length - 1];
      if (Date.parse(p.end) >= cutoff) { total += p.val; found = true; }
    }
    return found ? total : null;
  }
}

// ── Concept aliases ──
export const C = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ],
  costOfRevenue: ["CostOfGoodsAndServicesSold", "CostOfRevenue", "CostOfGoodsSold"],
  grossProfit: ["GrossProfit"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  epsDiluted: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  sharesOutstanding: ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"],
  assets: ["Assets"],
  liabilities: ["Liabilities"],
  assetsCurrent: ["AssetsCurrent"],
  liabilitiesCurrent: ["LiabilitiesCurrent"],
  equity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  retainedEarnings: ["RetainedEarningsAccumulatedDeficit"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  // NVIDIA switched to DebtSecuritiesCurrent in early 2026; the older concepts
  // still carry the history and are backfilled behind it.
  shortTermInvestments: [
    "MarketableSecuritiesCurrent",
    "DebtSecuritiesCurrent",
    "ShortTermInvestments",
    "AvailableForSaleSecuritiesDebtSecuritiesCurrent",
    "OtherShortTermInvestments",
  ],
  longTermInvestments: ["MarketableSecuritiesNoncurrent", "LongTermInvestments"],
  // Some filers publish one all-in debt figure; prefer it when present.
  totalDebtCombined: [
    "LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities",
    "DebtLongtermAndShorttermCombinedAmount",
  ],
  longTermDebt: [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
    "LongTermDebt",
    // Convertible notes are the whole capital structure for some issuers —
    // IREN carries $3.7B of them and tags nothing else.
    "ConvertibleLongTermNotesPayable",
    "ConvertibleNotesPayable",
  ],
  // Debt tranches are summed, not alias-matched: a filer can report current
  // maturities AND commercial paper, and taking only the first understates debt.
  currentDebt: [
    "LongTermDebtCurrent",
    "LongTermDebtAndCapitalLeaseObligationsCurrent",
    "ConvertibleNotesPayableCurrent",
  ],
  commercialPaper: ["CommercialPaper"],
  otherShortDebt: ["OtherShortTermBorrowings", "ShortTermBorrowings"],
  ocf: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
  taxExpense: ["IncomeTaxExpenseBenefit"],
  interestExpense: ["InterestExpense", "InterestExpenseDebt", "InterestExpenseNonoperating"],
  inventory: ["InventoryNet"],
  // ── Additional statement lines, for the Financials viewer ──
  rnd: ["ResearchAndDevelopmentExpense"],
  sga: [
    "SellingGeneralAndAdministrativeExpense",
    "GeneralAndAdministrativeExpense",
    "SellingAndMarketingExpense",
  ],
  pretaxIncome: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesDomestic",
  ],
  dna: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAmortizationAndAccretionNet",
    "DepreciationAndAmortization",
  ],
  stockComp: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"],
  receivables: ["AccountsReceivableNetCurrent", "ReceivablesNetCurrent"],
  ppe: ["PropertyPlantAndEquipmentNet"],
  goodwill: ["Goodwill"],
  intangibles: ["IntangibleAssetsNetExcludingGoodwill", "FiniteLivedIntangibleAssetsNet"],
  accountsPayable: ["AccountsPayableCurrent", "AccountsPayableAndAccruedLiabilitiesCurrent"],
  investingCF: ["NetCashProvidedByUsedInInvestingActivities"],
  financingCF: ["NetCashProvidedByUsedInFinancingActivities"],
  dividendsPaid: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends"],
  buybacks: ["PaymentsForRepurchaseOfCommonStock"],
  debtRepayment: ["RepaymentsOfLongTermDebt", "RepaymentsOfDebt"],
  acquisitions: ["PaymentsToAcquireBusinessesNetOfCashAcquired"],
  netChangeInCash: [
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect",
    "CashAndCashEquivalentsPeriodIncreaseDecrease",
  ],
};

/**
 * Ticker → CIK from the SEC's own mapping file (small, cached 24h). Resolving
 * this locally instead of via a marketstack call lets the EDGAR work start
 * immediately, in parallel with the price/ratings calls, instead of waiting
 * for the whole marketstack batch to finish first.
 */
export async function resolveCik(ticker: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const map = await res.json();
    const t = ticker.toUpperCase();
    for (const k of Object.keys(map)) {
      if (map[k]?.ticker === t) return String(map[k].cik_str).padStart(10, "0");
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchFacts(cik: string): Promise<Facts | null> {
  try {
    const res = await fetch(FACTS_URL(cik), {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
      next: { revalidate: 21600 }, // filings land a few times a year; 6h is plenty
    });
    if (!res.ok) return null;
    return new Facts(await res.json());
  } catch {
    return null;
  }
}

const safeDiv = (a: number | null, b: number | null): number | null =>
  a != null && b != null && b !== 0 ? a / b : null;

/**
 * Piotroski F-Score — nine binary fundamental checks.
 *
 * Uses fiscal-year figures (latest 10-K vs the one before), which is Piotroski's
 * original methodology. Running it on TTM instead makes the trend checks jitter
 * on partial-year noise and produces a different score than every published
 * screener. Balance-sheet items are read at the matching fiscal year ends.
 */
function piotroski(f: Facts) {
  const niAnnual = f.annual(C.netIncome);
  if (niAnnual.length < 2) return { score: 0, outOf: 0, checks: [], basis: "unavailable" as const };
  const fyEnd = niAnnual[niAnnual.length - 1].end;
  const fyPriorEnd = niAnnual[niAnnual.length - 2].end;

  const annualAt = (aliases: string[], end: string): number | null => {
    const s = f.annual(aliases);
    const hit = s.find((x) => x.end === end);
    if (hit) return hit.val;
    // Fiscal calendars can drift a few days year to year.
    let best: Period | null = null, gap = Infinity;
    for (const x of s) {
      const g = Math.abs(Date.parse(x.end) - Date.parse(end));
      if (g < gap) { gap = g; best = x; }
    }
    return best && gap < 45 * 864e5 ? best.val : null;
  };

  const ni = annualAt(C.netIncome, fyEnd);
  const niPrior = annualAt(C.netIncome, fyPriorEnd);
  const assets = f.instantAt(C.assets, fyEnd);
  const assetsPrior = f.instantAt(C.assets, fyPriorEnd);
  const ocf = annualAt(C.ocf, fyEnd);
  const ltd = f.instantAt(C.longTermDebt, fyEnd);
  const ltdPrior = f.instantAt(C.longTermDebt, fyPriorEnd);
  const ca = f.instantAt(C.assetsCurrent, fyEnd);
  const cl = f.instantAt(C.liabilitiesCurrent, fyEnd);
  const caPrior = f.instantAt(C.assetsCurrent, fyPriorEnd);
  const clPrior = f.instantAt(C.liabilitiesCurrent, fyPriorEnd);
  const shares = annualAt(C.dilutedShares, fyEnd);
  const sharesPrior = annualAt(C.dilutedShares, fyPriorEnd);
  const rev = annualAt(C.revenue, fyEnd);
  const revPrior = annualAt(C.revenue, fyPriorEnd);
  const gp = annualAt(C.grossProfit, fyEnd);
  const gpPrior = annualAt(C.grossProfit, fyPriorEnd);

  const roa = safeDiv(ni, assets);
  const roaPrior = safeDiv(niPrior, assetsPrior);
  const gm = safeDiv(gp, rev);
  const gmPrior = safeDiv(gpPrior, revPrior);
  const turn = safeDiv(rev, assets);
  const turnPrior = safeDiv(revPrior, assetsPrior);
  const cr = safeDiv(ca, cl);
  const crPrior = safeDiv(caPrior, clPrior);
  const lev = safeDiv(ltd, assets);
  const levPrior = safeDiv(ltdPrior, assetsPrior);

  const checks: { label: string; pass: boolean | null }[] = [
    { label: "Positive net income", pass: ni == null ? null : ni > 0 },
    { label: "Positive operating cash flow", pass: ocf == null ? null : ocf > 0 },
    { label: "ROA improving", pass: roa == null || roaPrior == null ? null : roa > roaPrior },
    { label: "Cash flow exceeds net income", pass: ocf == null || ni == null ? null : ocf > ni },
    { label: "Leverage decreasing", pass: lev == null || levPrior == null ? null : lev <= levPrior },
    { label: "Current ratio improving", pass: cr == null || crPrior == null ? null : cr > crPrior },
    { label: "No share dilution", pass: shares == null || sharesPrior == null ? null : shares <= sharesPrior * 1.01 },
    { label: "Gross margin improving", pass: gm == null || gmPrior == null ? null : gm > gmPrior },
    { label: "Asset turnover improving", pass: turn == null || turnPrior == null ? null : turn > turnPrior },
  ];
  const scored = checks.filter((c) => c.pass !== null);
  return {
    score: checks.filter((c) => c.pass === true).length,
    outOf: scored.length,
    checks,
    basis: `FY ending ${fyEnd} vs ${fyPriorEnd}`,
  };
}

/** Altman Z-Score (public manufacturer variant). */
function altmanZ(f: Facts, marketCap: number | null, liabilitiesOverride: number | null) {
  const ta = f.latestInstant(C.assets);
  const tl = f.latestInstant(C.liabilities) ?? liabilitiesOverride;
  const ca = f.latestInstant(C.assetsCurrent);
  const cl = f.latestInstant(C.liabilitiesCurrent);
  const re = f.latestInstant(C.retainedEarnings);
  const rev = f.ttm(C.revenue);
  const op = f.ttm(C.operatingIncome);
  if (ta == null || tl == null || ca == null || cl == null || rev == null) return null;
  const wc = ca - cl;
  const z =
    1.2 * (wc / ta) +
    1.4 * ((re ?? 0) / ta) +
    3.3 * ((op ?? 0) / ta) +
    0.6 * (marketCap != null && tl !== 0 ? marketCap / tl : 0) +
    1.0 * (rev / ta);
  return Number.isFinite(z) ? z : null;
}

/**
 * Two-stage FCF discounted cash flow. Deliberately conservative and fully
 * disclosed in the UI — it's a reference point, not a price target.
 */
function dcf(f: Facts, shares: number | null) {
  const ocf = f.ttm(C.ocf);
  const capex = f.ttm(C.capex);
  if (ocf == null || shares == null || shares <= 0) return null;
  const fcf = ocf - (capex ?? 0);
  if (!(fcf > 0)) return null;

  // Growth from a multi-year FCF CAGR, not a single year-over-year step —
  // one soft year (working-capital swings, a big capex cycle) would otherwise
  // pin a durable business at zero growth for a decade.
  const ocfA = f.annual(C.ocf);
  const capexA = f.annual(C.capex);
  const capexByEnd = new Map(capexA.map((x) => [x.end, x.val]));
  const fcfSeries = ocfA
    .map((x) => ({ end: x.end, val: x.val - (capexByEnd.get(x.end) ?? 0) }))
    .filter((x) => x.val > 0)
    .slice(-6);
  let observed = 0.05;
  if (fcfSeries.length >= 3) {
    const first = fcfSeries[0].val;
    const lastFcf = fcfSeries[fcfSeries.length - 1].val;
    const yrs = fcfSeries.length - 1;
    observed = Math.pow(lastFcf / first, 1 / yrs) - 1;
  }
  // Clamp hard: a single great stretch shouldn't imply 40% growth forever.
  const g1 = Math.max(0, Math.min(0.12, observed));
  const discount = 0.10;
  const terminal = 0.025;

  let pv = 0;
  let cash = fcf;
  for (let y = 1; y <= 5; y++) {
    cash *= 1 + g1;
    pv += cash / Math.pow(1 + discount, y);
  }
  for (let y = 6; y <= 10; y++) {
    cash *= 1 + g1 / 2;
    pv += cash / Math.pow(1 + discount, y);
  }
  const tv = (cash * (1 + terminal)) / (discount - terminal);
  pv += tv / Math.pow(1 + discount, 10);

  const perShare = pv / shares;
  return Number.isFinite(perShare) && perShare > 0
    ? { perShare, assumedGrowth: g1, discount, terminal, fcf }
    : null;
}

/**
 * Quarterly + TTM series for the Charts page.
 *
 * Uses quarterlyComplete() so reconstructed Q4s are included — without them
 * every fourth bar would be missing, since US filers fold Q4 into the 10-K.
 * Balance-sheet items are point-in-time and need no reconstruction.
 */
export function deriveChartSeries(f: Facts, limit = 28) {
  type Pt = { date: string; label: string; value: number };

  // Fiscal-year-end month, taken from the company's own annual periods.
  const fyEnds = f.annual(C.revenue).length ? f.annual(C.revenue) : f.annual(C.netIncome);
  const fyEndMonth = fyEnds.length
    ? new Date(new Date(fyEnds[fyEnds.length - 1].end).getTime() - 5 * 864e5).getMonth() + 1
    : 12;

  /**
   * Fiscal quarter label, derived from the period end relative to the filer's
   * fiscal year end.
   *
   * The `fy`/`fp` fields on a companyfacts entry describe the FILING, not the
   * fact's own period — a 10-Q carries prior-year comparatives stamped with the
   * current filing's fiscal tag. Trusting them produced duplicate labels
   * ("Q2 '26" on both the Mar-2025 and Mar-2026 quarters). Computing from the
   * fiscal calendar is unambiguous: Apple's FY ends in September, so its
   * December quarter is correctly Q1 of the following fiscal year.
   */
  const qLabel = (endDate: string): string => {
    const d = new Date(new Date(endDate).getTime() - 5 * 864e5); // Apr-1 ends belong to Q1
    const m = d.getMonth() + 1;
    const fy = m > fyEndMonth ? d.getFullYear() + 1 : d.getFullYear();
    const offset = (m - fyEndMonth - 1 + 12) % 12;
    return `Q${Math.floor(offset / 3) + 1} '${String(fy).slice(2)}`;
  };
  const pts = (s: Period[]): Pt[] =>
    s.slice(-limit).map((p) => ({ date: p.end, label: qLabel(p.end), value: p.val }));

  const flow = (aliases: string[]) => pts(f.quarterlyComplete(aliases));
  const stock = (aliases: string[]) => pts(f.instant(aliases));

  /** Rolling 4-quarter sum — the TTM view of a flow series. */
  const ttm = (s: Pt[]): Pt[] =>
    s.map((p, i) =>
      i < 3 ? null : { ...p, value: s.slice(i - 3, i + 1).reduce((a, x) => a + x.value, 0) }
    ).filter(Boolean) as Pt[];

  const align = (a: Pt[], b: Pt[], fn: (x: number, y: number) => number | null): Pt[] => {
    const m = new Map(b.map((p) => [p.date, p.value]));
    return a
      .map((p) => {
        const other = m.get(p.date);
        if (other == null) return null;
        const v = fn(p.value, other);
        return v == null || !Number.isFinite(v) ? null : { ...p, value: v };
      })
      .filter(Boolean) as Pt[];
  };

  const revenue = flow(C.revenue);
  const grossProfit = flow(C.grossProfit);
  const operatingIncome = flow(C.operatingIncome);
  const netIncome = flow(C.netIncome);
  const ocf = flow(C.ocf);
  const capex = flow(C.capex);
  const epsQ = flow(C.epsDiluted);
  const sharesQ = flow(C.dilutedShares);

  const fcf = align(ocf, capex, (o, c) => o - c);
  const revTtm = ttm(revenue);

  return {
    revenue: { q: revenue, ttm: revTtm },
    ocf: { q: ocf, ttm: ttm(ocf) },
    operatingIncome: { q: operatingIncome, ttm: ttm(operatingIncome) },
    netIncome: { q: netIncome, ttm: ttm(netIncome) },
    eps: { q: epsQ, ttm: ttm(epsQ) },
    fcf: { q: fcf, ttm: ttm(fcf) },
    // Per-share divides by the share count for that quarter, not a TTM sum of
    // share counts — shares are a stock, not a flow, so summing four quarters
    // would understate per-share values by ~4x.
    fcfPerShare: {
      q: align(fcf, sharesQ, (v, sh) => (sh > 0 ? v / sh : null)),
      ttm: align(ttm(fcf), sharesQ, (v, sh) => (sh > 0 ? v / sh : null)),
    },
    grossMargin: align(grossProfit, revenue, (g, r) => (r !== 0 ? (g / r) * 100 : null)),
    netMargin: align(netIncome, revenue, (n, r) => (r !== 0 ? (n / r) * 100 : null)),
    shares: stock(C.sharesOutstanding).length >= 4 ? stock(C.sharesOutstanding) : sharesQ,
    equity: stock(C.equity),
    currentAssets: stock(C.assetsCurrent),
    currentLiabilities: stock(C.liabilitiesCurrent),
    cash: stock(C.cash),
    shortTermInvestments: stock(C.shortTermInvestments),
    debt: stock(C.longTermDebt),
    // TTM EPS/revenue power the historical P/E and P/S charts.
    epsTtm: ttm(epsQ),
    revenueTtm: revTtm,
    sharesForRatio: sharesQ,
  };
}

/**
 * Full financial statements, period by period, for the Financials viewer.
 *
 * Returns column-oriented periods (newest first) with every statement line
 * keyed by the same field names the FMP-backed page uses, so the two render
 * identically. Flow rows go through quarterlyComplete(), which reconstructs Q4
 * and un-cumulates the year-to-date cash-flow tagging; balance-sheet rows are
 * point-in-time and read directly.
 */
export function deriveStatements(f: Facts, period: "annual" | "quarterly", limit = 12) {
  const flow = (aliases: string[]): Period[] =>
    period === "annual" ? f.annual(aliases) : f.quarterlyComplete(aliases);
  const stockSeries = (aliases: string[]): Period[] => f.instant(aliases);

  // Column dates come from revenue (or net income for filers that don't tag it).
  const spine = flow(C.revenue).length ? flow(C.revenue) : flow(C.netIncome);
  const dates = spine.slice(-limit).map((p) => p.end).reverse();
  if (!dates.length) return { periods: [], rows: {} as Record<string, (number | null)[]> };

  const fyEnds = f.annual(C.revenue).length ? f.annual(C.revenue) : f.annual(C.netIncome);
  const fyEndMonth = fyEnds.length
    ? new Date(new Date(fyEnds[fyEnds.length - 1].end).getTime() - 5 * 864e5).getMonth() + 1
    : 12;
  const label = (end: string): string => {
    const d = new Date(new Date(end).getTime() - 5 * 864e5);
    const m = d.getMonth() + 1;
    const fy = m > fyEndMonth ? d.getFullYear() + 1 : d.getFullYear();
    if (period === "annual") return `FY ${fy}`;
    return `Q${Math.floor(((m - fyEndMonth - 1 + 12) % 12) / 3) + 1} ${fy}`;
  };

  const align = (series: Period[]): (number | null)[] => {
    const m = new Map(series.map((p) => [p.end, p.val]));
    return dates.map((d) => {
      const exact = m.get(d);
      if (exact != null) return exact;
      // Balance-sheet dates can be a day or two off the income-statement close.
      let best: number | null = null, gap = Infinity;
      for (const p of series) {
        const g = Math.abs(Date.parse(p.end) - Date.parse(d));
        if (g < gap) { gap = g; best = p.val; }
      }
      return gap <= 10 * 864e5 ? best : null;
    });
  };

  const F = (a: string[]) => align(flow(a));
  const B = (a: string[]) => align(stockSeries(a));
  const sub = (a: (number | null)[], b: (number | null)[]) =>
    a.map((v, i) => (v == null ? null : v - (b[i] ?? 0)));
  const add = (a: (number | null)[], b: (number | null)[]) =>
    a.map((v, i) => (v == null && b[i] == null ? null : (v ?? 0) + (b[i] ?? 0)));

  const revenue = F(C.revenue);
  const grossProfit = F(C.grossProfit);
  const costOfRevenue = F(C.costOfRevenue);
  const operatingIncome = F(C.operatingIncome);
  const netIncome = F(C.netIncome);
  const dna = F(C.dna);
  const ocf = F(C.ocf);
  const capex = F(C.capex);
  const goodwill = B(C.goodwill);
  const intangibles = B(C.intangibles);
  const assets = B(C.assets);
  const equity = B(C.equity);

  const rows: Record<string, (number | null)[]> = {
    // Income statement
    revenue,
    costOfRevenue: costOfRevenue.some((v) => v != null) ? costOfRevenue : sub(revenue, grossProfit),
    grossProfit: grossProfit.some((v) => v != null) ? grossProfit : sub(revenue, costOfRevenue),
    researchAndDevelopmentExpenses: F(C.rnd),
    sellingGeneralAndAdministrativeExpenses: F(C.sga),
    operatingIncome,
    interestExpense: F(C.interestExpense),
    incomeBeforeTax: F(C.pretaxIncome),
    incomeTaxExpense: F(C.taxExpense),
    netIncome,
    // EBITDA isn't a GAAP line — reconstructed as operating income + D&A.
    ebitda: add(operatingIncome, dna),
    epsDiluted: F(C.epsDiluted),

    // Balance sheet
    cashAndCashEquivalents: B(C.cash),
    shortTermInvestments: B(C.shortTermInvestments),
    netReceivables: B(C.receivables),
    inventory: B(C.inventory),
    totalCurrentAssets: B(C.assetsCurrent),
    propertyPlantEquipmentNet: B(C.ppe),
    goodwillAndIntangibleAssets: add(goodwill, intangibles),
    totalAssets: assets,
    accountPayables: B(C.accountsPayable),
    shortTermDebt: B(C.currentDebt),
    totalCurrentLiabilities: B(C.liabilitiesCurrent),
    longTermDebt: B(C.longTermDebt),
    // Coca-Cola and others never tag Liabilities — fall back to the identity.
    totalLiabilities: (() => {
      const direct = B(C.liabilities);
      return direct.some((v) => v != null) ? direct : sub(assets, equity);
    })(),
    retainedEarnings: B(C.retainedEarnings),
    totalStockholdersEquity: equity,

    // Cash flow
    depreciationAndAmortization: dna,
    stockBasedCompensation: F(C.stockComp),
    operatingCashFlow: ocf,
    capitalExpenditure: capex,
    acquisitionsNet: F(C.acquisitions),
    investingCashFlow: F(C.investingCF),
    dividendsPaid: F(C.dividendsPaid),
    commonStockRepurchased: F(C.buybacks),
    debtRepayment: F(C.debtRepayment),
    financingCashFlow: F(C.financingCF),
    freeCashFlow: sub(ocf, capex),
    netChangeInCash: F(C.netChangeInCash),
  };

  return { periods: dates.map((d) => ({ date: d, label: label(d) })), rows };
}

export type Fundamentals = ReturnType<typeof deriveFundamentals>;

export function deriveFundamentals(f: Facts, price: number | null) {
  const revenue = f.ttm(C.revenue);
  const revenuePrior = f.ttmPrior(C.revenue);
  const grossProfit = f.ttm(C.grossProfit);
  const costOfRev = f.ttm(C.costOfRevenue);
  const gp = grossProfit ?? (revenue != null && costOfRev != null ? revenue - costOfRev : null);
  const opIncome = f.ttm(C.operatingIncome);
  const netIncome = f.ttm(C.netIncome);
  const netIncomePrior = f.ttmPrior(C.netIncome);
  const dilutedShares = f.ttm(C.dilutedShares);
  const dilutedSharesPrior = f.ttmPrior(C.dilutedShares);
  // Coca-Cola last tagged EarningsPerShareDiluted in 2009; derive per-share
  // earnings from net income when the concept is missing or stale.
  const epsTagged = f.ttm(C.epsDiluted);
  const epsTaggedPrior = f.ttmPrior(C.epsDiluted);
  const epsFresh = f.annual(C.epsDiluted).slice(-1)[0]?.end;
  const epsUsable =
    epsTagged != null && epsFresh != null &&
    Date.parse(epsFresh) > Date.now() - 2 * 365 * 864e5;
  const eps = epsUsable ? epsTagged : safeDiv(netIncome, dilutedShares);
  const epsPrior = epsUsable ? epsTaggedPrior : safeDiv(netIncomePrior, dilutedSharesPrior);

  const shares = f.latestInstant(C.sharesOutstanding) ?? dilutedShares;
  const marketCap = price != null && shares != null ? price * shares : null;

  const equity = f.latestInstant(C.equity);
  const equityPrior = f.instantPrior(C.equity);
  const assets = f.latestInstant(C.assets);
  // Coca-Cola never tags Liabilities directly — derive it from the balance
  // sheet identity so Altman-Z and leverage aren't silently unavailable.
  const liabilities =
    f.latestInstant(C.liabilities) ?? (assets != null && equity != null ? assets - equity : null);
  const ca = f.latestInstant(C.assetsCurrent);
  const cl = f.latestInstant(C.liabilitiesCurrent);
  const cash = f.latestInstant(C.cash);
  const sti = f.latestInstant(C.shortTermInvestments);
  const lti = f.latestInstant(C.longTermInvestments);

  const ocf = f.ttm(C.ocf);
  const capex = f.ttm(C.capex);
  const fcf = ocf != null ? ocf - (capex ?? 0) : null;

  // Sum every debt tranche the filer reports. Alias-matching only the first
  // would miss commercial paper sitting alongside current maturities.
  const balanceDate = f.instant(C.assets).slice(-1)[0]?.end ?? new Date().toISOString().slice(0, 10);
  const combinedDebt = f.sumInstant([C.totalDebtCombined], balanceDate);
  const totalDebt =
    combinedDebt ??
    f.sumInstant([C.longTermDebt, C.currentDebt, C.commercialPaper, C.otherShortDebt], balanceDate);
  // Net debt counts short-term investments as cash — ignoring them overstates
  // leverage badly for cash-rich balance sheets. Long-term marketable securities
  // are reported separately rather than netted, since that's the stricter
  // convention, but they're material (Apple holds ~$84B) so the UI discloses them.
  const liquid = (cash ?? 0) + (sti ?? 0);
  const netDebt = totalDebt != null ? totalDebt - liquid : null;

  const avgEquity = equity != null && equityPrior != null ? (equity + equityPrior) / 2 : equity;
  const revenueGrowth = revenue != null && revenuePrior ? revenue / revenuePrior - 1 : null;
  const epsGrowth = eps != null && epsPrior && epsPrior > 0 ? eps / epsPrior - 1 : null;
  const peRatio = price != null && eps != null && eps > 0 ? price / eps : null;
  const pegRatio = peRatio != null && epsGrowth != null && epsGrowth > 0 ? peRatio / (epsGrowth * 100) : null;

  return {
    asOf: f.instant(C.assets).slice(-1)[0]?.end ?? null,
    revenue,
    revenueGrowth,
    grossProfit: gp,
    grossMargin: safeDiv(gp, revenue),
    operatingIncome: opIncome,
    operatingMargin: safeDiv(opIncome, revenue),
    netIncome,
    netMargin: safeDiv(netIncome, revenue),
    netIncomeGrowth: netIncome != null && netIncomePrior ? netIncome / netIncomePrior - 1 : null,
    eps,
    epsGrowth,
    peRatio,
    pegRatio,
    ps: safeDiv(marketCap, revenue),
    pb: safeDiv(marketCap, equity),
    pfcf: safeDiv(marketCap, fcf),
    fcfYield: safeDiv(fcf, marketCap),
    roe: safeDiv(netIncome, avgEquity),
    roa: safeDiv(netIncome, assets),
    currentRatio: safeDiv(ca, cl),
    debtToEquity: safeDiv(totalDebt, equity),
    netDebt,
    totalDebt,
    cash: liquid,
    longTermInvestments: lti,
    assets,
    liabilities,
    equity,
    ocf,
    capex,
    fcf,
    shares,
    marketCap,
    piotroski: piotroski(f),
    altmanZ: altmanZ(f, marketCap, liabilities),
    dcf: dcf(f, shares),
    // Annual series for charting — reversed to newest-first for the UI.
    annual: {
      revenue: f.annual(C.revenue).slice(-10).reverse(),
      netIncome: f.annual(C.netIncome).slice(-10).reverse(),
      ocf: f.annual(C.ocf).slice(-10).reverse(),
      eps: f.annual(C.epsDiluted).slice(-10).reverse(),
    },
  };
}
