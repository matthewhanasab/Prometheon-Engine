import { normalizeCompanyName, companyNameKey } from "@/lib/etfHoldingsIndex";

// The company universe the earnings calendar scans.
//
// There's no index-membership feed in our stack, so the constituent lists are
// derived from what index funds actually hold, as filed with the SEC:
//   • S&P 500  → VOO's N-PORT portfolio
//   • All      → VOO + IJH (mid cap) + IJR (small cap), i.e. the S&P 1500
//
// N-PORT reports holdings by name, not ticker, so each name is resolved against
// SEC's own ticker→CIK file: exact normalised match first, then an
// order-insensitive fallback for registrants EDGAR files surname-first. Names
// that resolve to neither (delisted holdings left in a stale quarterly filing,
// cash sweep vehicles) are dropped rather than guessed at.
const MS = "https://api.marketstack.com/v2";
const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";

export type UniverseKey = "sp500" | "all";

export const UNIVERSE_FUNDS: Record<UniverseKey, string[]> = {
  sp500: ["VOO"],
  all: ["VOO", "IJH", "IJR"],
};

export const UNIVERSE_LABEL: Record<UniverseKey, string> = {
  sp500: "S&P 500",
  all: "All Stocks",
};

export type Company = { ticker: string; cik: string; name: string };

async function json(url: string, ttl: number, headers?: Record<string, string>): Promise<any> {
  try {
    const res = await fetch(url, { headers, next: { revalidate: ttl } });
    return await res.json();
  } catch {
    return null;
  }
}

/** ticker → CIK, plus name→ticker indexes for resolving fund holdings. */
async function secIndex() {
  const map = await json("https://www.sec.gov/files/company_tickers.json", 86400, {
    "User-Agent": SEC_UA,
    Accept: "application/json",
  });
  if (!map) return null;
  const byExact = new Map<string, Company>();
  const bySorted = new Map<string, Company>();
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row?.ticker) continue;
    const entry: Company = {
      ticker: String(row.ticker).toUpperCase(),
      cik: String(row.cik_str).padStart(10, "0"),
      name: String(row.title ?? row.ticker).replace(/\s*\/[A-Z]{2,4}\/?\s*$/, "").trim(),
    };
    const exact = normalizeCompanyName(row.title);
    const sorted = companyNameKey(row.title);
    // First registration wins; later ones are usually secondary share classes.
    if (exact && !byExact.has(exact)) byExact.set(exact, entry);
    if (sorted && !bySorted.has(sorted)) bySorted.set(sorted, entry);
  }
  return { byExact, bySorted };
}

/**
 * Resolve the requested universe to companies with CIKs. Returns them sorted by
 * ticker so the scan order is stable across calls — that's what lets a partial
 * scan resume cheaply on the next request, since each fetch is separately cached.
 */
export async function resolveUniverse(which: UniverseKey): Promise<Company[]> {
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return [];
  const idx = await secIndex();
  if (!idx) return [];

  // Fund order is preserved deliberately, with each fund's own names sorted.
  // VOO comes first, so an "all" scan replays the already-warm S&P 500 from
  // cache and spends its whole time budget on the mid- and small-caps it hasn't
  // seen. Sorting the union alphabetically instead interleaved them, and every
  // pass re-walked the same large-caps before reaching anything new.
  const seen = new Set<string>();
  const ordered: Company[] = [];
  for (const fund of UNIVERSE_FUNDS[which]) {
    const raw = await json(`${MS}/etfholdings?access_key=${key}&ticker=${fund}`, 86400);
    const holdings = raw?.output?.holdings;
    if (!Array.isArray(holdings)) continue;
    const batch = new Map<string, Company>();
    for (const h of holdings) {
      const name = (h.investment_security ?? h)?.name;
      if (!name || name === "N/A") continue;
      const hit = idx.byExact.get(normalizeCompanyName(name)) ?? idx.bySorted.get(companyNameKey(name));
      if (hit && !seen.has(hit.ticker)) batch.set(hit.ticker, hit);
    }
    for (const c of [...batch.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))) {
      seen.add(c.ticker);
      ordered.push(c);
    }
  }
  return ordered;
}
