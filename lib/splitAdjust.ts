// Put as-reported per-share figures on today's share basis.
//
// SEC companyfacts is as-reported. A per-share number filed before a stock
// split is on the old share count, and it is restated only if a later filing
// happens to repeat that period as a comparative. NVIDIA's history therefore
// arrives on three bases at once (before its 4-for-1, between that and its
// 10-for-1, and after both), and a fourth quarter rebuilt as
// FY − (Q1 + Q2 + Q3) can mix two of them and come out negative in a year the
// company earned billions.
//
// The filings don't say which basis a number is on, but the possibilities are
// few: a value was filed on some date, so it is missing exactly the splits
// that happened after that date — always the most recent ones. Each candidate
// is tried against earnings ÷ split-adjusted share count, which is on today's
// basis by construction, and the closest wins.

export type SplitEvent = { date: string; factor: number };
type Pt = { date: string; label: string; value: number };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Remove one-quarter spikes from a split-adjusted share-count history.
 *
 * A count that disagrees with the quarters on BOTH sides of it is not a
 * buyback or a merger (those persist); it is a number on the wrong basis:
 * a cover page filed across a split date (Alphabet, twice in 2022), or one
 * typed in thousands (Chipotle, 2022). A spike that is a clean multiple is
 * divided back; one that isn't is dropped rather than guessed at.
 */
export function despike<T extends Pt>(series: T[], splits: SplitEvent[] = []): T[] {
  if (series.length < 4) return series;
  const factors = new Set<number>([2, 3, 4, 5, 6, 7, 8, 10, 15, 20, 25, 30, 40, 50, 1000, 1e6]);
  let run = 1;
  for (const ev of [...splits].sort((a, b) => b.date.localeCompare(a.date))) {
    const f = ev.factor >= 1 ? ev.factor : 1 / ev.factor;
    factors.add(f); run *= f; factors.add(run);
  }
  const near = (r: number) => [...factors].find((k) => Math.abs(Math.log(r / k)) < 0.12);
  const off = (r: number) => r > 2.5 || r < 0.4;

  // Four quarters each side, so a second spike nearby (Alphabet has two, six
  // months apart) can't drag a side's median toward itself.
  const side = (from: number, to: number) => {
    const xs = series.slice(Math.max(0, from), Math.max(0, to)).map((q) => q.value);
    return xs.length >= 2 ? median(xs) : null;
  };
  const out: T[] = [];
  series.forEach((p, i) => {
    const l = side(i - 4, i), r = side(i + 1, i + 5);
    if (l == null || r == null) { out.push(p); return; }
    const rl = p.value / l, rr = p.value / r;
    // A step agrees with one side; only a spike disagrees with both, the same way.
    if (!(off(rl) && off(rr) && (rl > 1) === (rr > 1))) { out.push(p); return; }
    const ratio = Math.sqrt(rl * rr);
    const k = ratio > 1 ? near(ratio) : near(1 / ratio);
    if (k) out.push({ ...p, value: ratio > 1 ? p.value / k : p.value * k });
    // else: dropped
  });
  return out;
}

/**
 * @param perShare   as-reported per-share series (EPS)
 * @param total      the matching company-wide total, same periods (net income)
 * @param shares     share count per period, already split-adjusted
 * @param splits     the split record
 *
 * Also fills the series in from total ÷ shares where a filer tags the
 * per-share figure for few of its quarters or none (Walmart tags quarterly EPS
 * under an extension concept, which left its chart with a single bar).
 */
export function adjustPerShare(perShare: Pt[], total: Pt[], shares: Pt[], splits: SplitEvent[]): Pt[] {
  const events = splits
    .filter((ev) => ev.factor > 0 && ev.factor !== 1)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalAt = new Map(total.map((p) => [p.date, p.value]));
  const sharesAt = new Map(shares.map((p) => [p.date, p.value]));
  const implied = (date: string): number | null => {
    const t = totalAt.get(date), s = sharesAt.get(date);
    return t != null && s != null && s > 0 ? t / s : null;
  };

  // Pass 1: settle every reported period that matches a candidate basis.
  const settled = new Map<string, number>();
  for (const p of perShare) {
    const later = events.filter((ev) => ev.date > p.date);
    if (!later.length) { settled.set(p.date, p.value); continue; }
    const ref = implied(p.date);
    if (ref == null || ref === 0 || p.value === 0) continue;
    const r = p.value / ref;
    if (!(r > 0)) continue; // opposite signs: a rebuilt quarter on mixed bases
    // Missing the last n splits, for n = 0 … all of them.
    let k = 1, best = { k: 1, miss: Math.abs(Math.log(r)) };
    for (let i = later.length - 1; i >= 0; i--) {
      k *= later[i].factor;
      const miss = Math.abs(Math.log(r / k));
      if (miss < best.miss) best = { k, miss };
    }
    // Diluted EPS and earnings ÷ period-end shares differ by a few percent, a
    // second share class by a constant; a split is at least 1.5×. Anything
    // further off than that matches no basis at all.
    if (best.miss < Math.log(1.45)) settled.set(p.date, p.value / best.k);
  }

  // How the settled periods relate to earnings ÷ shares, for the rest.
  const ratios: number[] = [];
  for (const [date, v] of settled) {
    const ref = implied(date);
    if (ref != null && ref !== 0 && v !== 0) {
      const q = v / ref;
      if (q > 0.5 && q < 2) ratios.push(q);
    }
  }
  const scale = ratios.length >= 4 ? median(ratios) : 1;

  // Pass 2: periods that fit no basis (rebuilt fourth quarters, mostly) take
  // earnings ÷ shares; so do the gaps of a filer that tags few quarters.
  const sparse = perShare.length < total.length * 0.6;
  const reported = new Map(perShare.map((p) => [p.date, p]));
  // A sparse series is rebuilt on the totals' own window; its stray old
  // quarters (Coca-Cola tags two, from 2008 and 2009) would otherwise sit at
  // the front of the chart, a decade from their neighbours.
  const since = sparse && total.length ? total[0].date : "";
  const spine = [...new Set([...perShare.map((p) => p.date), ...(sparse ? total.map((p) => p.date) : [])])]
    .filter((d) => d >= since)
    .sort();
  const labelAt = new Map([...total, ...perShare].map((p) => [p.date, p.label]));

  const out: Pt[] = [];
  for (const date of spine) {
    const fixed = settled.get(date);
    if (fixed != null) { out.push({ ...(reported.get(date) as Pt), value: fixed }); continue; }
    const ref = implied(date);
    // No reference either: the number can't be placed on any basis, and a
    // wrong figure is worse than a gap.
    if (ref != null) out.push({ date, label: labelAt.get(date) ?? "", value: ref * scale });
  }
  return out;
}
