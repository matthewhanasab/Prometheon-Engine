// Earnings calendar for one trading week.
//
// The first version of this page projected every date from a company's SEC
// 8-K (item 2.02) filing cadence. That is a sound estimate months out, but for
// the weeks people actually look at it was simply wrong often enough to read as
// broken: Constellation Brands a day late, Delta a day early, and nothing to
// say whether a company reports before the open or after the close.
//
// Companies announce their dates a few weeks ahead and the exchange publishes
// them, so near weeks now come from Nasdaq's public earnings calendar — the
// scheduled date, the time of day, the consensus EPS estimate, and once the
// day has passed, the reported figure and the surprise. That feed reaches about
// seven weeks out; beyond it the filing-cadence projection still does the job
// and is labelled as a projection.

export type CalendarEntry = {
  ticker: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  /** Before the open, after the close, or not announced. */
  time: "pre" | "post" | null;
  epsEstimate: number | null;
  /** Number of analyst estimates behind the consensus. */
  estimates: number | null;
  /** Reported EPS — only present once the company has reported. */
  epsActual: number | null;
  /** Surprise against consensus, in percent. */
  surprisePct: number | null;
  marketCap: number | null;
  sp500: boolean;
};

// "$6.48" → 6.48, "($0.52)" → -0.52, "$405,756,510,000" → 405756510000.
// Blank and "N/A" mean the feed has no figure, which must stay null, not 0.
function money(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()$,\-\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

function plain(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  const n = Number(s.replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Share-class tickers are written BRK.B, BRK/B or BRK-B depending on who
 *  publishes them; compare on letters and digits only. */
export const tickerKey = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** One day's scheduled reporters. `null` means the fetch failed — distinct
 *  from an empty array, which means nothing is scheduled (or the day is past
 *  the feed's horizon). */
export async function fetchEarningsDay(
  date: string,
  sp500: Set<string>
): Promise<CalendarEntry[] | null> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: {
        // Without a browser-shaped Accept header the endpoint answers with an
        // HTML page instead of JSON.
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        Accept: "application/json",
      },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object" || !("data" in json)) return null;
    const rows: Record<string, unknown>[] = Array.isArray(json.data?.rows) ? json.data.rows : [];

    const seen = new Set<string>();
    const out: CalendarEntry[] = [];
    for (const r of rows) {
      const ticker = String(r.symbol ?? "").toUpperCase().trim();
      if (!ticker || seen.has(ticker)) continue;
      seen.add(ticker);
      const t = String(r.time ?? "");
      out.push({
        ticker,
        name: String(r.name ?? ticker),
        date,
        time: t === "time-pre-market" ? "pre" : t === "time-after-hours" ? "post" : null,
        epsEstimate: money(r.epsForecast),
        estimates: plain(r.noOfEsts),
        epsActual: money(r.eps),
        surprisePct: plain(r.surprise),
        marketCap: money(r.marketCap),
        sp500: sp500.has(tickerKey(ticker)),
      });
    }
    return out;
  } catch {
    return null;
  }
}
