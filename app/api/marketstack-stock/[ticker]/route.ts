import { NextRequest, NextResponse } from "next/server";
import { fetchFacts, deriveFundamentals, resolveCik } from "@/lib/edgarFacts";
import { get10YTreasury } from "@/lib/fred";

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

// Failed upstream calls are never stored in the Next.js data cache, so without
// this a rate-limited endpoint re-pays its full retry backoff on EVERY page
// load — including fully-cached ones. A short negative cache turns a failing
// endpoint into a fast miss instead of a 6-second stall.
const failCache: Map<string, number> =
  ((globalThis as any).__msFailCache ??= new Map<string, number>());
const FAIL_TTL = 90_000;

async function get(url: string, ttl = DAY): Promise<{ data: any; err: string | null }> {
  const failedAt = failCache.get(url);
  if (failedAt && Date.now() - failedAt < FAIL_TTL) {
    return { data: null, err: "rate_limit_reached (recent, skipped)" };
  }
  let out = await getOnce(url, ttl);
  // marketstack enforces a strict per-second rate limit; short paced retries.
  for (let i = 0; i < 2 && out.err === "rate_limit_reached"; i++) {
    await sleep(1200 + i * 1300);
    out = await getOnce(url, ttl);
  }
  if (out.err === "rate_limit_reached") failCache.set(url, Date.now());
  else failCache.delete(url);
  return out;
}

// Concurrency-limited pool with NO fixed sleeps. The old approach paced fixed
// 1.1s gaps between batches, which ran even when every response came from the
// Next.js data cache — a fully-cached page load still took ~4.5s of pure sleep.
// A pool lets cached responses stream through instantly; only genuinely
// rate-limited calls pay for waiting, via get()'s backoff retries.
async function pool<T>(jobs: (() => Promise<T>)[], limit = 4): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const idx = next++;
      results[idx] = await jobs[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
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

  // EDGAR fundamentals run in PARALLEL with the marketstack pool (SEC traffic
  // doesn't count against marketstack's rate limit). The CIK comes from the
  // SEC's own ticker map, cached 24h.
  const cikPromise = resolveCik(t);
  const factsPromise = cikPromise.then((cik) => (cik ? fetchFacts(cik) : null));

  // Everything marketstack goes through ONE pool at concurrency 2 — their
  // per-second limit is strict enough that a burst of 4 parallel calls gets
  // some of them 429'd. Cached responses resolve in ~5ms, so a warm load
  // sails through the pool with no real serialization. eod/latest was
  // dropped: the eod series' newest row is the same data, one call cheaper.
  // Ratings and submissions sit at the end of the list where traffic is
  // thinnest — they're the endpoints most prone to 429.
  const [eodRes, intradayRes, infoRes, divRes, splitRes, tickRes, ...tailRes] =
    await pool(
      [
        () => get(`${MS}/eod?access_key=${key}&symbols=${t}&limit=400`),
        // A full session of minute bars, not a single bar: same API cost, and it
        // powers both the live quote and the intraday chart.
        () => get(`${MS}/intraday?access_key=${key}&symbols=${t}&interval=1min&limit=400`, QUOTE_TTL),
        () => get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`),
        () => get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=200`),
        () => get(`${MS}/splits?access_key=${key}&symbols=${t}&limit=60`),
        () => get(`${MS}/tickers/${t}?access_key=${key}`),
        ...horizons.map((y) => () =>
          get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(y)}&sort=ASC&limit=1`)
        ),
        // Five years of daily closes for the ticker and for SPY, sampled to
        // month-ends for the beta regression. Published betas (Yahoo et al.) use
        // 5-year monthly; a 1-year daily window is a different statistic and
        // produced a nonsensical negative beta for defensive names like KO.
        () => get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(5)}&limit=1400`),
        () => get(`${MS}/eod?access_key=${key}&symbols=SPY&date_from=${anchorFor(5)}&limit=1400`),
        () => get(`${MS}/companyratings?access_key=${key}&ticker=${t}`),
        async () => {
          const cik = await cikPromise;
          return cik
            ? get(`${MS}/submissions?access_key=${key}&cik_code=${cik}`)
            : { data: null, err: "no CIK" };
        },
      ],
      2
    );
  const anchorRes = tailRes.slice(0, horizons.length);
  const stock5yRes = tailRes[horizons.length];
  const spy5yRes = tailRes[horizons.length + 1];
  const ratingsRes = tailRes[horizons.length + 2];
  const subsRes = tailRes[horizons.length + 3];

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

  const last = { close: eod[0].close, date: eod[0].date };
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

  // ── Beta: 5-year monthly returns regressed against SPY, the convention
  // published betas use. β = cov(stock, market) / var(market). Sanity-checked
  // by running SPY against itself, which returns exactly 1.000. ──
  const monthEnds = (res: any): Map<string, number> => {
    const byMonth = new Map<string, { date: string; close: number }>();
    for (const r of rows(res?.data)) {
      const date = String(r.date ?? "").slice(0, 10);
      // adj_close so splits/dividends don't inject fake return spikes.
      const close = Number(r.adj_close ?? r.close ?? 0);
      if (!date || !(close > 0)) continue;
      const m = date.slice(0, 7);
      const cur = byMonth.get(m);
      if (!cur || date > cur.date) byMonth.set(m, { date, close });
    }
    return new Map([...byMonth].map(([m, v]) => [m, v.close]));
  };
  const stockM = monthEnds(stock5yRes);
  const spyM = monthEnds(spy5yRes);
  const months = [...stockM.keys()].filter((m) => spyM.has(m)).sort();
  const paired: { s: number; m: number }[] = [];
  for (let i = 1; i < months.length; i++) {
    const sPrev = stockM.get(months[i - 1])!, sCur = stockM.get(months[i])!;
    const mPrev = spyM.get(months[i - 1])!, mCur = spyM.get(months[i])!;
    paired.push({ s: sCur / sPrev - 1, m: mCur / mPrev - 1 });
  }
  let beta: number | null = null;
  if (paired.length >= 24) {
    const n = paired.length;
    const ms = paired.reduce((a, x) => a + x.s, 0) / n;
    const mm = paired.reduce((a, x) => a + x.m, 0) / n;
    const cov = paired.reduce((a, x) => a + (x.s - ms) * (x.m - mm), 0) / (n - 1);
    const varM = paired.reduce((a, x) => a + (x.m - mm) ** 2, 0) / (n - 1);
    if (varM > 0) beta = cov / varM;
  }

  const rf = (await get10YTreasury()) ?? 0.043;

  // ── Daily series for the built-in chart, ascending. Sourced from the 5-year
  // pull so every range toggle (1M…5Y) has data, and on adj_close so a split
  // doesn't draw a cliff mid-chart. ──
  const priceSeries = rows(stock5yRes?.data)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      price: Number(r.adj_close ?? r.close ?? 0),
    }))
    .filter((r) => r.date && r.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Real-time IEX intraday.
  //
  // Field trap: `open`/`close` on an intraday bar are the SESSION's open/close,
  // identical on every bar — charting them draws a flat line. The actual
  // per-minute traded price is `marketstack_last`. The `last`/`bid`/`ask` quote
  // fields only populate while the market is open, so they're a bonus, not the
  // basis. ──
  const pos = (v: any): number | null => {
    const n = num(v);
    return n != null && n > 0 ? n : null;
  };
  const iRows = rows(intradayRes.data);
  const iSeries = iRows
    .map((r) => ({
      t: String(r.date ?? ""),
      p: pos(r.marketstack_last) ?? pos(r.last) ?? pos(r.mid),
      v: num(r.volume),
    }))
    .filter((r) => r.p != null && r.t)
    .sort((a, b) => a.t.localeCompare(b.t));

  const iq = iRows[0];
  const newest = iSeries[iSeries.length - 1];
  // Session boundary = the most recent bar's calendar day, so after-hours the
  // panel shows the last complete session rather than mixing two days.
  const sessionDay = newest ? newest.t.slice(0, 10) : null;
  const session = sessionDay ? iSeries.filter((r) => r.t.slice(0, 10) === sessionDay) : [];
  const sessionPrices = session.map((r) => r.p as number);

  const intraday = newest
    ? {
        last: newest.p,
        time: newest.t.replace("T", " ").slice(0, 16),
        sessionDate: sessionDay,
        sessionHigh: sessionPrices.length ? Math.max(...sessionPrices) : null,
        sessionLow: sessionPrices.length ? Math.min(...sessionPrices) : null,
        sessionOpen: session.length ? session[0].p : null,
        volume: session.length ? Math.max(...session.map((r) => r.v ?? 0)) : null,
        bars: session.length,
        // Quote-book fields, live-hours only.
        bid: iq ? pos(iq.bid_price) : null,
        ask: iq ? pos(iq.ask_price) : null,
        bidSize: iq ? pos(iq.bid_size) : null,
        askSize: iq ? pos(iq.ask_size) : null,
        // Thinned for transport; enough points for a smooth line.
        series: session
          .filter((_, i) => i % Math.max(1, Math.ceil(session.length / 200)) === 0)
          .map((r) => ({ t: r.t.slice(11, 16), p: r.p })),
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

  // ── SEC filings + XBRL fundamentals (already fetched in parallel above).
  // Fundamentals come from EDGAR directly — marketstack's Statements/Facts/
  // Concepts endpoints 404 despite being on the Business plan's feature list. ──
  let filings: any[] = [];
  let fundamentals: any = null;
  const tickMeta = tickRes.data?.data ?? tickRes.data;
  const facts = await factsPromise;
  const cik: string | null =
    (await cikPromise) ?? (tickMeta?.cik ? String(tickMeta.cik).padStart(10, "0") : null);
  if (facts) {
    try {
      fundamentals = deriveFundamentals(facts, last.close);
    } catch {
      fundamentals = null;
    }
  }
  {
    const recent = subsRes?.data?.data?.filings?.recent;
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
    price: priceSeries,
    capm: {
      rf,
      beta,
      betaSamples: paired.length,
      // Market return held at 10% to match the research page's convention.
      erp: 0.10 - rf,
      expected: beta != null ? rf + beta * (0.10 - rf) : null,
      actual1Y: longReturns.find((r) => r.years === 1 && r.available)?.totalPct ?? null,
    },
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
