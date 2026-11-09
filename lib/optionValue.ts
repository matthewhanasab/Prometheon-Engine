// Valuing an option contract back through time.
//
// The price history of an individual contract isn't published anywhere the
// site can read, so this estimates it. The estimate is the Black-Scholes value
// of the contract on each past day, at that day's closing stock price and with
// that day's time left to expiry, holding volatility at the level today's
// quote implies.
//
// That volatility is not taken from the feed: it is solved for, so that the
// model reproduces today's actual quote exactly. The line therefore always
// ends at the real price, and what it shows before that is how the stock's
// path and the passing of time alone would have moved the contract. It leaves
// out the thing a real price history would add: changes in implied volatility
// (the run-up into earnings and the drop after it, most of all).

export type Close = { date: string; close: number };
export type Valued = { date: string; value: number; stock: number };

// Abramowitz-Stegun 7.1.26: the normal CDF to about seven places.
function cdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Black-Scholes value of a European call or put. `years` to expiry, `vol` and `rate` as fractions. */
export function blackScholes(side: "call" | "put", spot: number, strike: number, years: number, vol: number, rate: number): number {
  const intrinsic = side === "call" ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  if (!(years > 0) || !(vol > 0)) return intrinsic;
  const sq = vol * Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (vol * vol) / 2) * years) / sq;
  const d2 = d1 - sq;
  const disc = strike * Math.exp(-rate * years);
  return side === "call" ? spot * cdf(d1) - disc * cdf(d2) : disc * cdf(-d2) - spot * cdf(-d1);
}

/**
 * The volatility at which the model gives `price`. Null when no volatility
 * does: a quote below the contract's floor, as deep in-the-money contracts
 * sometimes show when the last trade is stale.
 */
export function impliedVol(side: "call" | "put", price: number, spot: number, strike: number, years: number, rate: number): number | null {
  if (!(price > 0) || !(years > 0)) return null;
  let lo = 0.005, hi = 6;
  if (blackScholes(side, spot, strike, years, lo, rate) > price) return null;
  if (blackScholes(side, spot, strike, years, hi, rate) < price) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (blackScholes(side, spot, strike, years, mid, rate) < price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const DAY = 864e5;
/** Years from the close on `date` to the close on `expiry`. */
const yearsBetween = (date: string, expiry: string) =>
  (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY / 365;

/**
 * The contract's estimated value on each day in `closes`, ending at `today`.
 *
 * @param price  today's actual quote for the contract (mid, or last trade)
 * @param spot   the underlying's price that quote goes with
 * @param fallbackVol  the feed's implied volatility, used only if none can be solved for
 */
export function valueHistory(opts: {
  side: "call" | "put"; strike: number; expiry: string;
  price: number; spot: number; today: string;
  closes: Close[]; rate?: number; fallbackVol?: number | null;
}): { series: Valued[]; vol: number; calibrated: boolean } | null {
  const { side, strike, expiry, price, spot, today, closes, fallbackVol } = opts;
  const rate = opts.rate ?? 0.04;
  const left = yearsBetween(today, expiry);
  const solved = left > 0 ? impliedVol(side, price, spot, strike, left, rate) : null;
  const vol = solved ?? (fallbackVol && fallbackVol > 0 ? fallbackVol : null);
  if (vol == null) return null;

  const series: Valued[] = [];
  for (const c of closes) {
    if (c.date >= today) break;
    const years = yearsBetween(c.date, expiry);
    if (!(years > 0)) continue;
    series.push({ date: c.date, value: blackScholes(side, c.close, strike, years, vol, rate), stock: c.close });
  }
  // Today is the real quote, not a modelled one.
  series.push({ date: today, value: price, stock: spot });
  return { series, vol, calibrated: solved != null };
}
