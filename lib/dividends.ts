export type DividendRow = { date: string; amount: number; [k: string]: any };

/**
 * Drop implausible dividend prints.
 *
 * marketstack occasionally emits a bad amount: NVIDIA's 2026-06-04 payment
 * comes through as $0.25 against $0.01 in every surrounding quarter — a 25×
 * jump that never happened. Left in, it inflates the trailing-twelve-month
 * total, the yield and the payout ratio (NVDA's payout read 4.3% instead of
 * 0.6%).
 *
 * The threshold is deliberately high. Genuine special dividends are real and
 * usually land within a few multiples of the regular payment, so only a print
 * more than `factor`× the median of its neighbours is treated as an error, and
 * only when there are enough neighbours to establish a median at all.
 */
export function dropDividendOutliers(
  rows: DividendRow[],
  factor = 8,
  neighbours = 6
): { kept: DividendRow[]; dropped: DividendRow[] } {
  if (rows.length < neighbours + 1) return { kept: rows, dropped: [] };

  // Judge each payment against its TEMPORAL neighbours, not the whole history.
  // A global median is useless here: dividends grow over decades and survive
  // stock splits, so NVIDIA's median across all history sits near its old
  // pre-split payment and a 25× bad print never clears the bar. Comparing a
  // payment to the ones around it is what actually catches a rogue value.
  const byDate = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const dropped = new Set<DividendRow>();

  byDate.forEach((row, i) => {
    const near: number[] = [];
    for (let step = 1; near.length < neighbours && step < byDate.length; step++) {
      const before = byDate[i - step];
      const after = byDate[i + step];
      if (before) near.push(before.amount);
      if (after && near.length < neighbours) near.push(after.amount);
    }
    if (near.length < 3) return;
    near.sort((a, b) => a - b);
    const median = near[Math.floor(near.length / 2)];
    if (median > 0 && row.amount > median * factor) dropped.add(row);
  });

  return {
    kept: rows.filter((r) => !dropped.has(r)),
    dropped: rows.filter((r) => dropped.has(r)),
  };
}

/**
 * Expected next ex-dividend date, projected from the payment cadence.
 *
 * A company that pays quarterly only declares its next dividend a few weeks
 * ahead, so between declarations the upcoming list is legitimately empty — and
 * the page said "Not declared", which reads like missing data rather than a
 * company that simply hasn't announced yet. Apple, J&J and P&G all showed it
 * simultaneously while Coca-Cola, mid-cycle, did not.
 *
 * The cadence is the median gap across recent ex-dates rather than the mean, so
 * one special dividend or a shifted quarter doesn't drag the estimate. Returns
 * null when the history is too short or too irregular to project honestly, and
 * never returns a date in the past.
 */
export function projectNextExDate(
  recent: DividendRow[],
  today = new Date().toISOString().slice(0, 10)
): { date: string; basis: "quarterly" | "monthly" | "semiannual" | "annual" | "irregular" } | null {
  const dates = recent
    .map((d) => d.date)
    .filter(Boolean)
    .sort()
    .slice(-9);
  if (dates.length < 3) return null;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const g = Math.round((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000);
    if (g > 20 && g < 400) gaps.push(g);
  }
  if (gaps.length < 2) return null;

  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // A payer whose gaps scatter isn't on a schedule worth projecting.
  const spread = sorted[sorted.length - 1] - sorted[0];
  if (spread > median * 0.8) return null;

  const basis =
    median <= 45 ? "monthly"
    : median <= 135 ? "quarterly"
    : median <= 250 ? "semiannual"
    : median <= 400 ? "annual"
    : "irregular";
  if (basis === "irregular") return null;

  // Step forward from the last known ex-date until the projection is ahead of
  // today — a stale history shouldn't produce a date that has already passed.
  let t = Date.parse(dates[dates.length - 1]);
  const todayMs = Date.parse(today);
  for (let i = 0; i < 12 && t <= todayMs; i++) t += median * 86400000;
  if (t <= todayMs) return null;

  return { date: new Date(t).toISOString().slice(0, 10), basis };
}
