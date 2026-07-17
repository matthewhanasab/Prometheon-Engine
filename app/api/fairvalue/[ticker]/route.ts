import { NextRequest, NextResponse } from "next/server";

const FMP = "https://financialmodelingprep.com/stable";

async function get(path: string, params: Record<string, string>) {
  const key = process.env.FMP_KEY ?? "";
  const url = new URL(`${FMP}${path}`);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: raw } = await params;
  const ticker = raw.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!ticker) return NextResponse.json({ error: "Bad ticker" }, { status: 400 });

  const from = new Date();
  from.setFullYear(from.getFullYear() - 21);
  const fromStr = from.toISOString().slice(0, 10);

  const [income, estimates, dividends, quote, profile, pricesRaw] = await Promise.all([
    get("/income-statement", { symbol: ticker, period: "annual", limit: "25" }),
    get("/analyst-estimates", { symbol: ticker, period: "annual", limit: "10" }),
    get("/dividends", { symbol: ticker, limit: "1000" }),
    get("/quote", { symbol: ticker }),
    get("/profile", { symbol: ticker }),
    get("/historical-price-eod/light", { symbol: ticker, from: fromStr }),
  ]);

  if (!Array.isArray(income) || income.length === 0) {
    return NextResponse.json({ error: "No fundamental data for this ticker" }, { status: 404 });
  }

  // ── Dividends per calendar year (ex-date based, split-adjusted) ──
  const dpsByYear = new Map<number, number>();
  for (const d of (Array.isArray(dividends) ? dividends : [])) {
    const y = parseInt(String(d.date ?? "").slice(0, 4));
    const amt = d.adjDividend ?? d.dividend ?? 0;
    if (!y || !amt) continue;
    dpsByYear.set(y, (dpsByYear.get(y) ?? 0) + amt);
  }

  // ── Historical fiscal years, ascending ──
  const hist = (income as any[])
    .map(r => ({
      year: parseInt(r.fiscalYear ?? String(r.date ?? "").slice(0, 4)),
      date: r.date as string,
      eps: (r.epsDiluted ?? r.eps ?? null) as number | null,
      dps: dpsByYear.get(parseInt(String(r.date ?? "").slice(0, 4))) ?? 0,
      est: false,
    }))
    .filter(r => r.year && r.date && r.eps != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (hist.length < 3) {
    return NextResponse.json({ error: "Not enough fiscal-year history" }, { status: 404 });
  }

  // ── Forward estimate years (up to 3 beyond the last reported year) ──
  const lastHistDate = hist[hist.length - 1].date;
  const lastDps = hist[hist.length - 1].dps || hist[hist.length - 2]?.dps || 0;
  const ests = (Array.isArray(estimates) ? estimates : [])
    .filter((e: any) => e?.date && e.date > lastHistDate && e.epsAvg != null && (e.numAnalystsEps ?? 1) >= 1)
    .sort((a: any, b: any) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map((e: any) => ({
      year: parseInt(String(e.date).slice(0, 4)),
      date: e.date as string,
      eps: e.epsAvg as number,
      dps: lastDps, // carry the last full-year dividend flat into estimate years
      est: true,
    }));

  // ── Monthly closes (last close of each month) + latest day ──
  const rows: any[] = Array.isArray(pricesRaw) ? pricesRaw : [];
  const monthly: { date: string; price: number }[] = [];
  const seen = new Set<string>();
  for (const r of rows) { // rows are newest-first; first row per month = that month's last close
    const ym = String(r.date ?? "").slice(0, 7);
    if (!ym || seen.has(ym)) continue;
    seen.add(ym);
    monthly.push({ date: r.date, price: r.price ?? 0 });
  }
  monthly.reverse();

  const q = Array.isArray(quote) ? quote[0] : quote;
  const p = Array.isArray(profile) ? profile[0] : profile;

  return NextResponse.json({
    ticker,
    name: p?.companyName ?? q?.name ?? ticker,
    sector: p?.sector ?? null,
    price: q?.price ?? p?.price ?? null,
    mktCap: q?.marketCap ?? p?.marketCap ?? null,
    years: [...hist, ...ests],
    prices: monthly,
  });
}
