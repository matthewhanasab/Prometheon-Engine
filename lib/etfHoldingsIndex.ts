// Reverse ETF lookup: given a stock, which ETFs hold it and at what weight.
//
// N-PORT identifies securities by CUSIP/ISIN/name — never by ticker — and no
// endpoint in our stack maps a ticker to its CUSIP. So the join is made on a
// normalised company name, which matches reliably because both sides ultimately
// come from registrant filings ("NVIDIA CORP" vs "Nvidia Corp" normalise the
// same). Names that still don't match simply don't appear; nothing is guessed.

/** Corporate-form words that differ freely between filings and carry no identity. */
const SUFFIXES =
  /\b(incorporated|inc|corporation|corp|company|co|plc|ltd|limited|holdings?|group|the|sa|nv|ag|lp|trust|reit|class\s+[abc]|cl\s+[abc]|com|new)\b/g;

/**
 * Reduce a company name to a comparable identity key.
 * "Eli Lilly and Co" and "Eli Lilly & Co" both become "eli lilly".
 */
export function normalizeCompanyName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.replace(/&amp;/g, "&").toLowerCase();
  s = s.replace(/[^a-z0-9& ]/g, " ");
  s = s.replace(/\band\b/g, "&");          // unify "and" / "&" before stripping
  s = s.replace(SUFFIXES, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*&\s*$/, "").trim();    // a dangling "&" left by a stripped suffix
  return s;
}

export type UniverseEntry = { ticker: string; label: string; category: string };

/**
 * The funds scanned for the reverse lookup. Chosen for breadth of style, size
 * and sector so most US equities appear in several, while keeping the total
 * holdings volume modest — these are fetched as whole portfolios.
 *
 * Deliberately excludes SPY/QQQ/DIA (unit investment trusts that don't file
 * N-PORT holdings) and total-market funds like VTI (~3,600 holdings), whose
 * payload cost outweighs what they add over VOO + the small/mid funds.
 */
export const ETF_UNIVERSE: UniverseEntry[] = [
  { ticker: "VOO",  label: "Vanguard S&P 500",            category: "Core" },
  { ticker: "QQQM", label: "Invesco Nasdaq-100",          category: "Core" },
  { ticker: "VUG",  label: "Vanguard Growth",             category: "Style" },
  { ticker: "VTV",  label: "Vanguard Value",              category: "Style" },
  { ticker: "SCHD", label: "Schwab US Dividend",          category: "Dividend" },
  { ticker: "VYM",  label: "Vanguard High Dividend",      category: "Dividend" },
  { ticker: "VIG",  label: "Vanguard Dividend Growth",    category: "Dividend" },
  { ticker: "DGRO", label: "iShares Dividend Growth",     category: "Dividend" },
  { ticker: "IJH",  label: "iShares Core S&P Mid-Cap",    category: "Size" },
  { ticker: "IJR",  label: "iShares Core S&P Small-Cap",  category: "Size" },
  { ticker: "VO",   label: "Vanguard Mid-Cap",            category: "Size" },
  { ticker: "VB",   label: "Vanguard Small-Cap",          category: "Size" },
  { ticker: "XLK",  label: "Technology Select",           category: "Sector" },
  { ticker: "XLF",  label: "Financials Select",           category: "Sector" },
  { ticker: "XLV",  label: "Health Care Select",          category: "Sector" },
  { ticker: "XLE",  label: "Energy Select",               category: "Sector" },
  { ticker: "XLY",  label: "Consumer Discretionary",      category: "Sector" },
  { ticker: "XLP",  label: "Consumer Staples Select",     category: "Sector" },
  { ticker: "XLI",  label: "Industrials Select",          category: "Sector" },
  { ticker: "XLU",  label: "Utilities Select",            category: "Sector" },
  { ticker: "XLC",  label: "Communication Services",      category: "Sector" },
  { ticker: "XLB",  label: "Materials Select",            category: "Sector" },
  { ticker: "XLRE", label: "Real Estate Select",          category: "Sector" },
  { ticker: "SMH",  label: "VanEck Semiconductor",        category: "Thematic" },
  { ticker: "VGT",  label: "Vanguard Info Tech",          category: "Thematic" },
  { ticker: "ARKK", label: "ARK Innovation",              category: "Thematic" },
  { ticker: "COWZ", label: "Pacer US Cash Cows",          category: "Thematic" },
  { ticker: "JEPI", label: "JPMorgan Equity Premium",     category: "Income" },
];
