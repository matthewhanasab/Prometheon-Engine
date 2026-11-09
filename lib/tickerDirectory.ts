// Company directory for search: [symbol, name] pairs, largest company first.
// Loaded on demand (a 70KB chunk) and shared by the search menu and every
// ticker box, so "apple" finds AAPL without a request to the server.

export type DirectoryEntry = [symbol: string, name: string];

let cache: DirectoryEntry[] | null = null;
let pending: Promise<DirectoryEntry[]> | null = null;

export function loadDirectory(): Promise<DirectoryEntry[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= import("@/data/tickers.json")
    .then((m) => (cache = m.default.tickers as unknown as DirectoryEntry[]))
    .catch(() => (cache = []));
  return pending;
}

/** Symbol-prefix matches first (the list is size-ordered, so "A" leads with
 *  Apple), then companies with a word starting with the query. */
export function searchDirectory(dir: DirectoryEntry[], query: string, limit = 6): DirectoryEntry[] {
  const q = query.trim();
  if (!q) return [];
  const upper = q.toUpperCase();
  const lower = q.toLowerCase();
  const exact: DirectoryEntry[] = [];
  const bySymbol: DirectoryEntry[] = [];
  const byName: DirectoryEntry[] = [];
  for (const entry of dir) {
    const [s, n] = entry;
    if (s === upper) exact.push(entry);
    else if (s.startsWith(upper)) bySymbol.push(entry);
    else if (lower.length > 1 && n.toLowerCase().split(/[\s.,&-]+/).some((w) => w.startsWith(lower))) byName.push(entry);
  }
  // One row per company: a second share class or a preferred line (GOOG and
  // GOOGL, SMCI and SMCIP) would otherwise crowd out other companies. The
  // shortest symbol is the common stock; an exact symbol match always stays.
  const seen = new Map<string, number>();
  const out: DirectoryEntry[] = [];
  for (const entry of [...exact, ...bySymbol, ...byName]) {
    const at = seen.get(entry[1]);
    if (at === undefined) { seen.set(entry[1], out.length); out.push(entry); }
    else if (out[at][0] !== upper && entry[0].length < out[at][0].length) out[at] = entry;
  }
  return out.slice(0, limit);
}
