// Stock splits, handled once for the whole site.
//
// Two feeds have to be put on today's share basis: daily prices, and anything
// counted in shares or quoted per share in SEC filings. Neither can be trusted
// to arrive that way:
//
//   - The price feed's "adjusted close" is sometimes only partly adjusted.
//     Carvana split 5-for-1 in May 2026 and its adjusted series was divided by
//     five from January 2026 on and left untouched before that, so the chart
//     fell 81% over New Year, the one-year return read -78%, and the 52-week
//     high sat at $485 against a $73 share price.
//   - The split record can list one split twice, a day apart. Applied twice,
//     a 5-for-1 becomes a 25-for-1.
//
// So nothing in the feed is taken on trust. Prices are put on today's share basis
// from the closes themselves, by finding where they step by a recorded split's
// ratio (findSteps), and the feed's dividend adjustment is kept only where it is
// believable. Share counts and per-share figures from SEC filings are adjusted
// by the date each was filed against the split record (Facts.withSplits).

export type SplitEvent = { date: string; factor: number };

const DAY = 864e5;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * The feed's split rows as events: no-ops and malformed rows dropped, and a
 * split reported more than once (same ratio within a month) kept once, at the
 * later date.
 */
export function cleanSplits(raw: unknown): SplitEvent[] {
  const rows = Array.isArray(raw) ? raw : [];
  const events: SplitEvent[] = rows
    .map((r: any) => ({ date: String(r?.date ?? "").slice(0, 10), factor: Number(r?.split_factor ?? r?.factor ?? 1) }))
    .filter((ev) => isDate(ev.date) && Number.isFinite(ev.factor) && ev.factor > 0 && ev.factor !== 1)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out: SplitEvent[] = [];
  for (const ev of events) {
    const prev = out[out.length - 1];
    const same = prev && Math.abs(prev.factor / ev.factor - 1) < 0.001
      && Date.parse(ev.date) - Date.parse(prev.date) <= 31 * DAY;
    if (same) prev.date = ev.date; else out.push({ ...ev });
  }
  return out;
}

/** What a figure dated `date` must be divided by (prices) or multiplied by (share counts) to be on today's basis. */
export function factorAfter(date: string, events: SplitEvent[]): number {
  let k = 1;
  for (const ev of events) if (ev.date > date) k *= ev.factor;
  return k;
}

/**
 * Where the daily closes change share basis.
 *
 * The price feed cannot be trusted to put a split on the recorded date, or even
 * near it. Carvana split 5-for-1 on 8 May 2026; its closes drop by a factor of
 * five on 2 January, four months earlier (and are continuous across 8 May), as
 * if the vendor had applied the split to part of the history. So the position
 * of a split is read from the prices themselves: it is the day the close steps
 * by the split's ratio. Each recorded split is matched to at most one such
 * step, the nearest in time among the good fits. A split with no matching step
 * means the feed's closes are already on one basis throughout, and nothing is
 * adjusted for it.
 *
 * Returns the steps, each dated the first day of the new basis. Closes before
 * that date are divided by the factor.
 */
export function findSteps(barsAsc: { date: string; close: number }[], events: SplitEvent[]): SplitEvent[] {
  if (!events.length || barsAsc.length < 2) return [];
  type Cand = { i: number; k: number; score: number };
  const cands: Cand[] = [];
  for (let i = 1; i < barsAsc.length; i++) {
    const move = barsAsc[i].close / barsAsc[i - 1].close;
    for (let k = 0; k < events.length; k++) {
      // A forward split divides the price (move ≈ 1/factor), a reverse split
      // multiplies it; either way move × factor ≈ 1. The tolerance leaves room
      // for the day's own price change.
      const miss = Math.abs(Math.log(move * events[k].factor));
      if (miss > 0.28) continue;
      const yearsAway = Math.abs(Date.parse(barsAsc[i].date) - Date.parse(events[k].date)) / (365 * DAY);
      cands.push({ i, k, score: miss + 0.2 * yearsAway });
    }
  }
  cands.sort((a, b) => a.score - b.score);
  const usedEvent = new Set<number>(), usedBar = new Set<number>();
  const steps: SplitEvent[] = [];
  for (const c of cands) {
    if (usedEvent.has(c.k) || usedBar.has(c.i)) continue;
    usedEvent.add(c.k); usedBar.add(c.i);
    steps.push({ date: barsAsc[c.i].date, factor: events[c.k].factor });
  }
  return steps.sort((a, b) => a.date.localeCompare(b.date));
}

export type Bar = {
  date: string;
  /** Close on today's share basis. */
  close: number;
  /** The same, also adjusted for dividends: the series to measure returns on. */
  total: number;
  high: number;
  low: number;
  volume: number;
};

// The feed's adjusted close over the split-adjusted close is the dividend
// adjustment alone: a little under one, drifting up to one at the present.
// Outside this range the feed has the split wrong, not the dividends.
const DIVIDEND_RANGE: [number, number] = [0.3, 1.08];

/**
 * Daily rows from the price feed, oldest first, on today's share basis, given
 * the split record. Returns the bars and the steps found in them.
 */
export function adjustBars(rawRows: unknown, record: SplitEvent[]): { bars: Bar[]; steps: SplitEvent[]; basis: FeedBasis } {
  const rows = (Array.isArray(rawRows) ? rawRows : [])
    .map((r: any) => ({
      date: String(r?.date ?? "").slice(0, 10),
      close: Number(r?.close ?? 0),
      adj: Number(r?.adj_close ?? NaN),
      high: Number(r?.high ?? 0),
      low: Number(r?.low ?? 0),
      volume: Number(r?.volume ?? 0),
    }))
    .filter((r) => isDate(r.date) && r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const steps = findSteps(rows, record);

  const bars: Bar[] = rows.map((r) => {
    const k = factorAfter(r.date, steps);
    return { date: r.date, close: r.close / k, total: NaN, high: (r.high || r.close) / k, low: (r.low || r.close) / k, volume: r.volume * k };
  });
  // Dividend adjustment, newest to oldest: take the feed's where it is
  // believable, and carry the last believable one back across rows where the
  // feed's adjusted close has the split wrong.
  let carry = 1;
  for (let i = bars.length - 1; i >= 0; i--) {
    const q = rows[i].adj / bars[i].close;
    if (Number.isFinite(q) && q >= DIVIDEND_RANGE[0] && q <= DIVIDEND_RANGE[1]) carry = q;
    bars[i].total = bars[i].close * carry;
  }
  return { bars, steps, basis: feedBasis(rows, record, steps) };
}

/**
 * What the feed's closes are on, judged by the splits inside the window:
 * "raw" if they stepped at (or near) each recorded split, "adjusted" if they
 * did not, so the feed had already divided the whole history, and "unknown"
 * when no recorded split falls in the window to judge by. Rows from before the
 * window (a ten-year anchor) are on the same basis as the rest.
 */
export type FeedBasis = "raw" | "adjusted" | "unknown";
function feedBasis(rows: { date: string }[], record: SplitEvent[], steps: SplitEvent[]): FeedBasis {
  if (rows.length < 2) return "unknown";
  const inside = record.filter((ev) => ev.date > rows[0].date && ev.date <= rows[rows.length - 1].date);
  if (!inside.length) return "unknown";
  return steps.length === 0 ? "adjusted" : "raw";
}

/**
 * One row from the feed far back in time (a ten-year anchor) on today's basis,
 * dividend-adjusted where the feed's figure is believable. `basis` is what the
 * rest of the same ticker's closes turned out to be (see adjustBars); when it
 * is unknown the feed's adjusted close arbitrates: whichever reading of the
 * close it is consistent with, as a dividend adjustment, wins.
 */
export function adjustOne(raw: any, record: SplitEvent[], basis: FeedBasis = "unknown"): { date: string; close: number; total: number } | null {
  const date = String(raw?.date ?? "").slice(0, 10);
  const close = Number(raw?.close ?? 0);
  if (!isDate(date) || !(close > 0)) return null;
  const adj = Number(raw?.adj_close ?? NaN);
  const believable = (x: number) => { const q = adj / x; return Number.isFinite(q) && q >= DIVIDEND_RANGE[0] && q <= DIVIDEND_RANGE[1]; };
  const byRecord = close / factorAfter(date, record);
  let split: number;
  if (basis === "adjusted") split = close;
  else if (basis === "raw") split = byRecord;
  else split = believable(byRecord) || !believable(close) ? byRecord : close;
  return { date, close: split, total: believable(split) ? adj : split };
}
