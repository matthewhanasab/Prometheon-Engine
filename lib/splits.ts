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
// So prices are adjusted here from the raw closes and the cleaned split record,
// and the feed's own adjusted close is used only where it agrees.

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
 * Move each split to the day the raw close actually stepped.
 *
 * The record's date can be a day off the first day of trading on the new
 * basis, and one day off is the difference between a clean series and a single
 * bar five times too tall. Within a week either side, the day whose close moved
 * by the split ratio is the real one. A split with no such step in the prices
 * keeps its recorded date.
 */
export function settleSplits(barsAsc: { date: string; close: number }[], events: SplitEvent[]): SplitEvent[] {
  if (!events.length || barsAsc.length < 2) return events;
  return events.map((ev) => {
    const at = Date.parse(ev.date);
    let best: { date: string; miss: number } | null = null;
    for (let i = 1; i < barsAsc.length; i++) {
      const t = Date.parse(barsAsc[i].date);
      if (t < at - 7 * DAY) continue;
      if (t > at + 7 * DAY) break;
      const step = barsAsc[i].close / barsAsc[i - 1].close;
      const miss = Math.abs(Math.log(step * ev.factor));
      if (miss < 0.3 && (!best || miss < best.miss)) best = { date: barsAsc[i].date, miss };
    }
    return best ? { date: best.date, factor: ev.factor } : ev;
  });
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
 * Daily rows from the price feed, oldest first, on today's share basis.
 * Returns the bars and the split events as settled against them.
 */
export function adjustBars(rawRows: unknown, rawEvents: SplitEvent[]): { bars: Bar[]; events: SplitEvent[] } {
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
  const events = settleSplits(rows, rawEvents);

  const bars: Bar[] = rows.map((r) => {
    const k = factorAfter(r.date, events);
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
  return { bars, events };
}

/** One row from the feed (a long-horizon anchor) on today's basis, dividend-adjusted where the feed's figure is believable. */
export function adjustOne(raw: any, events: SplitEvent[]): { date: string; close: number; total: number } | null {
  const date = String(raw?.date ?? "").slice(0, 10);
  const close = Number(raw?.close ?? 0);
  if (!isDate(date) || !(close > 0)) return null;
  const split = close / factorAfter(date, events);
  const q = Number(raw?.adj_close ?? NaN) / split;
  const ok = Number.isFinite(q) && q >= DIVIDEND_RANGE[0] && q <= DIVIDEND_RANGE[1];
  return { date, close: split, total: ok ? split * q : split };
}
