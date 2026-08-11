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
