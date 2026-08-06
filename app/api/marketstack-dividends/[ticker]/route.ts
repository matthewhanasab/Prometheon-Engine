import { NextRequest, NextResponse } from "next/server";

// Full dividend record for the Market Stack edition's Dividends page.
// marketstack returns complete history even on cheap tiers (KO → 1977).
const MS = "https://api.marketstack.com/v2";

async function get(url: string): Promise<any> {
  try {
    let res = await fetch(url, { next: { revalidate: 86400 } });
    let json = await res.json().catch(() => null);
    if (json?.error?.code === "rate_limit_reached") {
      await new Promise((r) => setTimeout(r, 1400));
      res = await fetch(url, { next: { revalidate: 86400 } });
      json = await res.json().catch(() => null);
    }
    return json;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  const [divRaw, eodRaw, splitRaw] = [
    await get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=200`),
    await get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=1`),
    await get(`${MS}/splits?access_key=${key}&symbols=${t}&limit=60`),
  ];

  // Dividend amounts come back unadjusted, so KO's 1977 payout reads $1.94 —
  // six 2-for-1 splits before today. Charted raw, history looks like a decline;
  // divide each payment by the product of all later split factors instead.
  const splits = (Array.isArray(splitRaw?.data) ? splitRaw.data : [])
    .map((r: any) => ({ date: String(r.date ?? "").slice(0, 10), factor: Number(r.split_factor ?? 1) }))
    .filter((s: any) => s.date && s.factor > 0 && s.factor !== 1);
  const adjustFor = (date: string) =>
    splits.reduce((f: number, s: any) => (s.date > date ? f * s.factor : f), 1);

  const divs = (Array.isArray(divRaw?.data) ? divRaw.data : [])
    .map((r: any) => {
      const date = String(r.date ?? "").slice(0, 10);
      const raw = Number(r.dividend ?? 0);
      return {
        date,
        amount: date ? raw / adjustFor(date) : raw, // split-adjusted
        rawAmount: raw, // as actually paid at the time
        paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
        declarationDate: r.declaration_date ? String(r.declaration_date).slice(0, 10) : null,
        freq: r.distr_freq ?? null,
      };
    })
    .filter((r: any) => r.amount > 0 && r.date);
  if (!divs.length) {
    return NextResponse.json({ ticker: t, count: 0, yearly: [], upcoming: [], recent: [] });
  }

  const price = Number((Array.isArray(eodRaw?.data) ? eodRaw.data[0] : null)?.close ?? 0) || null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = divs.filter((d: any) => d.date > today);
  const past = divs.filter((d: any) => d.date <= today);

  // Annual totals for the growth chart. The current year is excluded from the
  // chart when incomplete — a partial year would read as a dividend cut.
  const byYear = new Map<string, number>();
  for (const d of past) {
    const y = d.date.slice(0, 4);
    byYear.set(y, (byYear.get(y) ?? 0) + d.amount);
  }
  const thisYear = today.slice(0, 4);
  const yearly = [...byYear.entries()]
    .map(([year, total]) => ({ year, total: Number(total.toFixed(4)), partial: year === thisYear }))
    .sort((a, b) => a.year.localeCompare(b.year));

  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttm = past.filter((d: any) => d.date >= ttmCutoff).reduce((a: number, d: any) => a + d.amount, 0);

  // Consecutive years of growth, ignoring the partial current year.
  const complete = yearly.filter((y) => !y.partial);
  let growthStreak = 0;
  for (let i = complete.length - 1; i > 0; i--) {
    if (complete[i].total > complete[i - 1].total) growthStreak++;
    else break;
  }

  return NextResponse.json({
    ticker: t,
    count: divs.length,
    oldest: divs[divs.length - 1].date,
    freq: divs.find((d: any) => d.freq)?.freq ?? null,
    price,
    ttm,
    yieldPct: ttm > 0 && price ? (ttm / price) * 100 : null,
    growthStreak,
    yearly,
    upcoming,
    recent: past.slice(0, 60),
  });
}
