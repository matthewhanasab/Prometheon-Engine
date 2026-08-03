import { NextRequest, NextResponse } from "next/server";

// Free-tier marketstack explorer. Probed endpoint availability on the free plan:
//   eod        ✓ but only ~1 year of history
//   tickerinfo ✓ full company profile (sector, industry, execs, address, about)
//   dividends  ✓ FULL history (AAPL goes back to 1987 — not capped at 1yr)
//   splits     ✓ FULL history
//   intraday   ✗ function_access_restricted (paid)
//   indexinfo  ✗ function_access_restricted (paid)
//   submissions✗ function_access_restricted (paid)
const MS = "https://api.marketstack.com/v2";

// Free tier is 100 requests/month and this route spends 4 per uncached ticker,
// so cache hard: repeat lookups of the same symbol cost nothing.
const REVALIDATE = 86400;

type Probe = { ok: boolean; note: string };

async function get(url: string): Promise<{ data: any; err: string | null }> {
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE } });
    const json = await res.json().catch(() => null);
    if (json && typeof json === "object" && "error" in json) {
      const e: any = (json as any).error;
      return { data: null, err: (e?.code || e?.message || String(e)) as string };
    }
    if (!res.ok) return { data: null, err: `HTTP ${res.status}` };
    return { data: json, err: null };
  } catch (e: any) {
    return { data: null, err: String(e?.message ?? e) };
  }
}

const asRows = (d: any): any[] =>
  Array.isArray(d?.data) ? d.data.filter((r: any) => r && typeof r === "object") : [];

// marketstack returns some text fields HTML-escaped ("SPDR S&amp;P 500 ETF").
// React renders text literally, so decode before it reaches the client.
function decode(s: any): any {
  if (typeof s !== "string") return s;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  const [eodRes, infoRes, divRes, splitRes] = await Promise.all([
    get(`${MS}/eod?access_key=${key}&symbols=${encodeURIComponent(t)}&limit=260`),
    get(`${MS}/tickerinfo?access_key=${key}&ticker=${encodeURIComponent(t)}`),
    get(`${MS}/dividends?access_key=${key}&symbols=${encodeURIComponent(t)}&limit=200`),
    get(`${MS}/splits?access_key=${key}&symbols=${encodeURIComponent(t)}&limit=50`),
  ]);

  const eodRows = asRows(eodRes.data);
  if (eodRows.length === 0) {
    return NextResponse.json(
      { error: eodRes.err ? `No price data (${eodRes.err})` : "Ticker not found" },
      { status: 404 }
    );
  }

  // ── Prices. Drop rows where close is 0: marketstack emits a few of these per
  // year with volume present but price missing, and charting them raw would
  // draw a spike to $0. ──
  const priced = eodRows
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      close: Number(r.close ?? 0),
      open: Number(r.open ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
      volume: Number(r.volume ?? 0),
      dividend: Number(r.dividend ?? 0),
      split: Number(r.split_factor ?? 1),
    }))
    .filter((r) => r.close > 0);
  const droppedZeroRows = eodRows.length - priced.length;

  const latest = priced[0];
  const closes = priced.map((r) => r.close);
  const high52 = Math.max(...priced.map((r) => r.high || r.close));
  const low52 = Math.min(...priced.map((r) => r.low || r.close));
  const avgVol = priced.reduce((a, r) => a + r.volume, 0) / (priced.length || 1);
  const prev = priced[1];
  const dayChangePct = prev ? ((latest.close - prev.close) / prev.close) * 100 : null;
  const oldest = priced[priced.length - 1];
  const periodReturnPct = oldest ? ((latest.close - oldest.close) / oldest.close) * 100 : null;

  // Chart series, oldest → newest, thinned so the sparkline payload stays small.
  const chron = [...priced].reverse();
  const step = Math.max(1, Math.floor(chron.length / 180));
  const series = chron.filter((_, i) => i % step === 0).map((r) => ({ d: r.date, c: r.close }));

  // ── Company profile ──
  const infoRaw = infoRes.data?.data;
  const info = Array.isArray(infoRaw) ? infoRaw[0] : infoRaw;
  const profile = info
    ? {
        name: decode(info.name) ?? null,
        sector: decode(info.sector) ?? null,
        industry: decode(info.industry) ?? null,
        itemType: decode(info.item_type) ?? null,
        employees: info.full_time_employees ?? null,
        website: info.website ?? null,
        phone: info.phone ?? null,
        incorporation: decode(info.incorporation) ?? null,
        fiscalYearEnd: info.end_fiscal ?? null,
        about: decode(info.about) ?? null,
        address: info.address
          ? [info.address.street1, info.address.city, info.address.state, info.address.postal_code]
              .filter(Boolean)
              .join(", ")
          : null,
        executives: Array.isArray(info.key_executives)
          ? info.key_executives.slice(0, 8).map((k: any) => ({
              name: decode(String(k?.name ?? "")).replace(/\s+/g, " ").trim(),
              role: decode(k?.function) ?? null,
              salary: k?.salary || null,
            }))
          : [],
        previousNames: Array.isArray(info.previous_names)
          ? info.previous_names.map((p: any) => ({ name: decode(p?.name), from: p?.from }))
          : [],
        listings: Array.isArray(info.stock_exchanges)
          ? info.stock_exchanges
              .map((s: any) => s?.acronym1 || s?.acronym || s?.name)
              .filter(Boolean)
              .slice(0, 8)
          : [],
      }
    : null;

  // ── Dividends (full history on the free tier) ──
  const divs = asRows(divRes.data)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      amount: Number(r.dividend ?? 0),
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
      recordDate: r.record_date ? String(r.record_date).slice(0, 10) : null,
      declarationDate: r.declaration_date ? String(r.declaration_date).slice(0, 10) : null,
      freq: r.distr_freq ?? null,
    }))
    .filter((r) => r.amount > 0);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = divs.filter((d) => d.date > today);
  const past = divs.filter((d) => d.date <= today);
  // Trailing twelve months from the most recent ex-date already passed.
  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttmDivs = past.filter((d) => d.date >= ttmCutoff);
  const ttmTotal = ttmDivs.reduce((a, d) => a + d.amount, 0);
  const dividendYield = ttmTotal > 0 && latest.close > 0 ? (ttmTotal / latest.close) * 100 : null;

  // ── Splits ──
  const splits = asRows(splitRes.data).map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    factor: Number(r.split_factor ?? 1),
  }));

  // ── Which endpoints this plan actually unlocks ──
  const capabilities: Record<string, Probe> = {
    "EOD prices": { ok: true, note: `${priced.length} rows · ~1yr cap on free` },
    "Company profile": profile
      ? { ok: true, note: "sector, industry, execs, address, about" }
      : { ok: false, note: infoRes.err ?? "unavailable" },
    Dividends: divs.length
      ? { ok: true, note: `${divs.length} records · full history` }
      : { ok: false, note: divRes.err ?? "none found" },
    Splits: splits.length
      ? { ok: true, note: `${splits.length} records · full history` }
      : { ok: false, note: splitRes.err ?? "none found" },
    Intraday: { ok: false, note: "function_access_restricted — paid only" },
    "Index data": { ok: false, note: "function_access_restricted — paid only" },
    "SEC submissions": { ok: false, note: "function_access_restricted — paid only" },
  };

  return NextResponse.json({
    ticker: t,
    profile,
    price: {
      latest: latest.close,
      latestDate: latest.date,
      dayChangePct,
      high52,
      low52,
      avgVol,
      periodReturnPct,
      oldestDate: oldest?.date ?? null,
      rowCount: priced.length,
      droppedZeroRows,
    },
    series,
    dividends: {
      all: past.slice(0, 40),
      upcoming,
      count: divs.length,
      oldest: divs.length ? divs[divs.length - 1].date : null,
      ttmTotal,
      dividendYield,
      freq: divs.find((d) => d.freq)?.freq ?? null,
    },
    splits,
    capabilities,
  });
}
