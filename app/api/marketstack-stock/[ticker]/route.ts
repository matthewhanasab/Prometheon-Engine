import { NextRequest, NextResponse } from "next/server";
import { fetchFacts, deriveFundamentals } from "@/lib/edgarFacts";

// Full research-page aggregator running exclusively on marketstack (Business
// plan). Endpoint audit for this key, verified 2026-08-02:
//   eod (15+yr, adjusted)       ✓     companyratings (225 analysts) ✓
//   eod/latest                  ✓     submissions (SEC EDGAR, by CIK) ✓
//   intraday (IEX bid/ask)      ✓     tickers/{sym} (cik, isin)     ✓
//   tickerinfo / dividends / splits ✓ (full depth even on free)
//   companystatements|facts|concepts  ✗ route not found (pricing page lists
//     them but the API doesn't serve them yet — asked via support)
//   etfholdings                 ✗ "no data at the moment" for SPY/QQQ
const MS = "https://api.marketstack.com/v2";

// Business plan = 500k req/mo, so caching is about speed, not rationing.
const DAY = 86400;
const QUOTE_TTL = 120; // latest quote + intraday go stale fast

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getOnce(url: string, ttl: number): Promise<{ data: any; err: string | null }> {
  try {
    const res = await fetch(url, { next: { revalidate: ttl } });
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

async function get(url: string, ttl = DAY): Promise<{ data: any; err: string | null }> {
  let out = await getOnce(url, ttl);
  // marketstack enforces a per-second rate limit; paced retries clear it. The
  // companyratings endpoint throttles harder than the rest, hence the long tail.
  for (let i = 0; i < 3 && out.err === "rate_limit_reached"; i++) {
    await sleep(1500 + i * 2500);
    out = await getOnce(url, ttl);
  }
  return out;
}

// Run jobs in small batches: 13 parallel calls trips the per-second limit,
// 3-at-a-time with a beat between batches does not.
async function batched<T>(jobs: (() => Promise<T>)[], size = 3, gapMs = 1100): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += size) {
    const chunk = jobs.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map((j) => j()))));
    if (i + size < jobs.length) await sleep(gapMs);
  }
  return out;
}

const rows = (d: any): any[] =>
  Array.isArray(d?.data) ? d.data.filter((r: any) => r && typeof r === "object") : [];

function decode(s: any): any {
  if (typeof s !== "string") return s;
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });

  // Anchor dates for long-horizon returns off the 15-year history entitlement.
  const anchorFor = (yearsBack: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - yearsBack);
    return d.toISOString().slice(0, 10);
  };
  const horizons = [1, 3, 5, 10, 15];

  const [eodRes, latestRes, intradayRes, infoRes, divRes, splitRes, ratingsRes, tickRes, ...anchorRes] =
    await batched([
      () => get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=400`),
      () => get(`${MS}/eod/latest?access_key=${key}&symbols=${t}`, QUOTE_TTL),
      () => get(`${MS}/intraday?access_key=${key}&symbols=${t}&interval=1min&limit=1`, QUOTE_TTL),
      () => get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`),
      () => get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=200`),
      () => get(`${MS}/splits?access_key=${key}&symbols=${t}&limit=60`),
      () => get(`${MS}/companyratings?access_key=${key}&ticker=${t}`),
      () => get(`${MS}/tickers/${t}?access_key=${key}`),
      ...horizons.map((y) => () =>
        get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(y)}&sort=ASC&limit=1`)
      ),
    ]);

  // ── EOD series (newest-first). Filter marketstack's occasional close=0 rows. ──
  const eod = rows(eodRes.data)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      close: Number(r.close ?? 0),
      high: Number(r.high ?? 0),
      low: Number(r.low ?? 0),
      volume: Number(r.volume ?? 0),
    }))
    .filter((r) => r.close > 0);
  if (eod.length === 0) {
    return NextResponse.json(
      { error: eodRes.err ? `No price data (${eodRes.err})` : "Ticker not found" },
      { status: 404 }
    );
  }

  const latestRow = rows(latestRes.data)[0];
  const last = latestRow && Number(latestRow.close) > 0
    ? { close: Number(latestRow.close), date: String(latestRow.date ?? "").slice(0, 10) }
    : { close: eod[0].close, date: eod[0].date };
  const prevClose = eod.find((r) => r.date < last.date)?.close ?? eod[1]?.close ?? null;
  const change = prevClose != null ? last.close - prevClose : null;
  const changePct = prevClose ? ((last.close - prevClose) / prevClose) * 100 : null;

  const yearWindow = eod.slice(0, 252);
  const week52High = Math.max(...yearWindow.map((r) => r.high || r.close));
  const week52Low = Math.min(...yearWindow.map((r) => r.low || r.close));
  const pos52 = week52High > week52Low
    ? ((last.close - week52Low) / (week52High - week52Low)) * 100
    : null;
  const avgVol = yearWindow.reduce((a, r) => a + r.volume, 0) / (yearWindow.length || 1);

  // ── Long-horizon returns (the 15-year entitlement, made visible) ──
  const longReturns = horizons.map((y, i) => {
    const row = rows(anchorRes[i]?.data)[0];
    // adj_close, not close: raw closes across a split make old anchors look
    // 2-10x too expensive (KO's 2011 close is pre-2012-split).
    const c = row ? Number(row.adj_close ?? row.close) : 0;
    if (!(c > 0)) return { years: y, available: false as const };
    const total = ((last.close - c) / c) * 100;
    const cagr = (Math.pow(last.close / c, 1 / y) - 1) * 100;
    return {
      years: y,
      available: true as const,
      fromDate: String(row.date ?? "").slice(0, 10),
      fromPrice: c,
      totalPct: total,
      cagrPct: cagr,
    };
  });

  // ── Real-time IEX quote. Off-hours the feed returns zeros — treat those as
  // absent so the UI hides the Live row instead of showing "$0.00 bid". ──
  const pos = (v: any): number | null => {
    const n = num(v);
    return n != null && n > 0 ? n : null;
  };
  const iq = rows(intradayRes.data)[0];
  const iqLast = iq ? pos(iq.last) ?? pos(iq.close) : null;
  const intraday = iq && iqLast != null
    ? {
        last: iqLast,
        bid: pos(iq.bid_price),
        ask: pos(iq.ask_price),
        bidSize: pos(iq.bid_size),
        askSize: pos(iq.ask_size),
        time: iq.date ? String(iq.date).replace("T", " ").slice(0, 16) : null,
      }
    : null;

  // ── Profile ──
  const infoRaw = infoRes.data?.data;
  const info = Array.isArray(infoRaw) ? infoRaw[0] : infoRaw;
  const profile = info
    ? {
        name: decode(info.name) ?? t,
        sector: decode(info.sector) ?? null,
        industry: decode(info.industry) ?? null,
        exchange: decode(info.exchange_code) ?? null,
        employees: info.full_time_employees ?? null,
        website: info.website ?? null,
        incorporation: decode(info.incorporation) ?? null,
        about: decode(info.about) ?? null,
        address: info.address
          ? [info.address.street1, info.address.city, info.address.state].filter(Boolean).join(", ")
          : null,
        executives: Array.isArray(info.key_executives)
          ? info.key_executives.slice(0, 8).map((k: any) => ({
              name: decode(String(k?.name ?? "")).replace(/\s+/g, " ").trim(),
              role: decode(k?.function) ?? null,
              salary: k?.salary || null,
            }))
          : [],
      }
    : null;

  // ── Analyst ratings ──
  const ratingsOut = ratingsRes.data?.result?.output;
  const cons = ratingsOut?.analyst_consensus;
  const analystList = Array.isArray(ratingsOut?.analysts) ? ratingsOut.analysts : [];
  const consensus = cons
    ? {
        avgTarget: num(cons.analyst_average),
        highTarget: num(cons.analyst_highest),
        lowTarget: num(cons.analyst_lowest),
        analysts: num(cons.analysts_number),
        buy: num(cons.buy) ?? 0,
        hold: num(cons.hold) ?? 0,
        sell: num(cons.sell) ?? 0,
        asOf: cons.consensus_date ?? null,
      }
    : null;
  const analysts = analystList
    .map((a: any) => ({
      name: decode(a?.analyst_name) ?? null,
      firm: decode(a?.analyst_firm) ?? null,
      rating: a?.rating?.rated ?? null,
      action: a?.rating?.conclusion ?? null,
      target: num(a?.rating?.price_target),
      date: a?.rating?.date_rating ?? null,
    }))
    .filter((a: any) => a.name && a.date)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 25);

  // ── Dividends ──
  const divs = rows(divRes.data)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      amount: Number(r.dividend ?? 0),
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
      declarationDate: r.declaration_date ? String(r.declaration_date).slice(0, 10) : null,
      freq: r.distr_freq ?? null,
    }))
    .filter((r) => r.amount > 0);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = divs.filter((d) => d.date > today);
  const past = divs.filter((d) => d.date <= today);
  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const ttmTotal = past.filter((d) => d.date >= ttmCutoff).reduce((a, d) => a + d.amount, 0);

  // ── Splits ──
  const splits = rows(splitRes.data).map((r) => ({
    date: String(r.date ?? "").slice(0, 10),
    factor: Number(r.split_factor ?? 1),
  }));

  // ── SEC filings + XBRL fundamentals, via CIK from /tickers ──
  let filings: any[] = [];
  let cik: string | null = null;
  let fundamentals: any = null;
  const tickMeta = tickRes.data?.data ?? tickRes.data;
  if (tickMeta?.cik) {
    cik = String(tickMeta.cik).padStart(10, "0");

    // Fundamentals come from EDGAR directly — marketstack's Statements/Facts/
    // Concepts endpoints 404 despite being on the Business plan's feature list.
    const facts = await fetchFacts(cik);
    if (facts) {
      try {
        fundamentals = deriveFundamentals(facts, last.close);
      } catch {
        fundamentals = null;
      }
    }

    const sub = await get(`${MS}/submissions?access_key=${key}&cik_code=${cik}`);
    const recent = sub.data?.data?.filings?.recent;
    if (recent?.form && Array.isArray(recent.form)) {
      const n = Math.min(recent.form.length, 400);
      const all: any[] = [];
      for (let i = 0; i < n; i++) {
        all.push({
          form: recent.form[i],
          filed: recent.filing_date?.[i] ?? null,
          reportDate: recent.report_date?.[i] || null,
          description: recent.primary_doc_description?.[i] || recent.form[i],
          accession: recent.accession_number?.[i] ?? null,
          document: recent.primary_document?.[i] ?? null,
        });
      }
      // Headline filings first (10-K/10-Q/8-K/DEF 14A), then the Form 4 stream.
      const major = all.filter((f) => /^(10-K|10-Q|8-K|DEF 14A|S-|20-F|6-K)/.test(f.form));
      filings = [...major.slice(0, 10), ...all.filter((f) => f.form === "4").slice(0, 5)];
    }
  }

  const filingUrl = (f: any) =>
    cik && f.accession && f.document
      ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(f.accession).replace(/-/g, "")}/${f.document}`
      : null;

  return NextResponse.json({
    ticker: t,
    profile,
    quote: {
      price: last.close,
      date: last.date,
      change,
      changePct,
      week52High,
      week52Low,
      pos52,
      avgVol,
    },
    intraday,
    longReturns,
    consensus,
    analysts,
    dividends: {
      recent: past.slice(0, 24),
      upcoming,
      count: divs.length,
      oldest: divs.length ? divs[divs.length - 1].date : null,
      ttmTotal,
      yieldPct: ttmTotal > 0 && last.close > 0 ? (ttmTotal / last.close) * 100 : null,
      freq: divs.find((d) => d.freq)?.freq ?? null,
    },
    splits,
    fundamentals,
    filings: filings.map((f) => ({ ...f, url: filingUrl(f) })),
    meta: {
      cik,
      isin: tickMeta?.isin ?? null,
      errors: {
        ratings: ratingsRes.err,
        intraday: intradayRes.err,
        profile: infoRes.err,
      },
    },
  });
}
