import { NextRequest, NextResponse } from "next/server";

// Side-by-side comparison of marketstack vs FMP for the same ticker.
// Purely a diagnostic for evaluating a licensed replacement feed — this route
// does not touch or replace any production FMP paths.
const MS_BASE = "https://api.marketstack.com/v2";
const FMP_BASE = "https://financialmodelingprep.com/stable";

// The free marketstack tier allows only 100 requests/month, so cache hard.
const REVALIDATE = 86400;

async function getJson(url: string) {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return res.json();
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const msKey = process.env.MARKETSTACK_KEY;
  const fmpKey = process.env.FMP_KEY;
  if (!msKey) return NextResponse.json({ error: "MARKETSTACK_KEY not configured" }, { status: 500 });

  const [msRaw, fmpRaw] = await Promise.all([
    getJson(`${MS_BASE}/eod?access_key=${msKey}&symbols=${encodeURIComponent(t)}&limit=120`),
    getJson(`${FMP_BASE}/historical-price-eod/light?symbol=${encodeURIComponent(t)}&apikey=${fmpKey}`),
  ]);

  // ── marketstack series (newest-first) ──
  const msErr = msRaw?.error
    ? (typeof msRaw.error === "string" ? msRaw.error : msRaw.error?.message ?? "marketstack error")
    : null;
  const msRows: any[] = Array.isArray(msRaw?.data) ? msRaw.data.filter((r: any) => r && typeof r === "object") : [];
  const msSeries = msRows.map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    close: r.close ?? null,
    adjClose: r.adj_close ?? null,
    volume: r.volume ?? null,
    dividend: r.dividend ?? 0,
    split: r.split_factor ?? 1,
  }));
  const msMeta = msRows[0]
    ? {
        name: msRows[0].name ?? null,
        exchange: msRows[0].exchange_code ?? msRows[0].exchange ?? null,
        assetType: msRows[0].asset_type ?? null,
        currency: msRows[0].price_currency ?? null,
        totalAvailable: msRaw?.pagination?.total ?? null,
      }
    : null;

  // ── FMP series (newest-first) ──
  const fmpErr = fmpRaw?.error ? String(fmpRaw.error) : null;
  const fmpArr: any[] = Array.isArray(fmpRaw) ? fmpRaw : [];
  const fmpSeries = fmpArr.slice(0, 400).map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    close: r.price ?? null,
  }));

  // ── Align by date and diff ──
  const fmpByDate = new Map(fmpSeries.map((r) => [r.date, r.close]));
  const rows = msSeries.map((m) => {
    const f = fmpByDate.get(m.date) ?? null;
    const diffPct =
      m.close != null && f != null && f !== 0 ? ((m.close - f) / f) * 100 : null;
    return { date: m.date, ms: m.close, fmp: f, diffPct, volume: m.volume, dividend: m.dividend, split: m.split };
  });

  // marketstack occasionally returns a row with close = 0 (volume present, price
  // missing). That's a data GAP, not a price disagreement — measuring the two
  // together would report a bogus "100% difference", so split them apart.
  const zeroRows = rows.filter((r) => r.ms === 0 || r.ms == null);
  const comparable = rows.filter((r) => r.diffPct != null && r.ms !== 0 && r.ms != null);
  const absDiffs = comparable.map((r) => Math.abs(r.diffPct as number));
  const worstRow = comparable.length
    ? comparable.reduce((w, r) => (Math.abs(r.diffPct as number) > Math.abs(w.diffPct as number) ? r : w))
    : null;
  const outliers = comparable
    .filter((r) => Math.abs(r.diffPct as number) >= 0.1)
    .sort((a, b) => Math.abs(b.diffPct as number) - Math.abs(a.diffPct as number))
    .slice(0, 8);
  const summary = {
    msRowCount: msSeries.length,
    fmpRowCount: fmpSeries.length,
    matchedDates: comparable.length,
    msOnlyDates: rows.filter((r) => r.fmp == null).length,
    zeroPriceRows: zeroRows.length,
    zeroPriceDates: zeroRows.map((r) => r.date).slice(0, 10),
    maxDiffPct: absDiffs.length ? Math.max(...absDiffs) : null,
    avgDiffPct: absDiffs.length ? absDiffs.reduce((a, b) => a + b, 0) / absDiffs.length : null,
    exactMatches: comparable.filter((r) => Math.abs(r.diffPct as number) < 0.005).length,
    msLatest: msSeries[0] ?? null,
    fmpLatest: fmpSeries[0] ?? null,
    msHistoryDepth: msMeta?.totalAvailable ?? null,
    dividendsFound: msSeries.filter((r) => (r.dividend ?? 0) > 0).length,
    splitsFound: msSeries.filter((r) => (r.split ?? 1) !== 1).length,
    worstRow,
    outliers,
  };

  return NextResponse.json({
    ticker: t,
    marketstack: { meta: msMeta, error: msErr, sample: msSeries.slice(0, 5) },
    fmp: { error: fmpErr, sample: fmpSeries.slice(0, 5) },
    summary,
    rows: rows.slice(0, 60),
  });
}
