import { NextRequest, NextResponse } from "next/server";
import { fetchFacts, deriveFundamentals, resolveCik } from "@/lib/edgarFacts";
import { get10YTreasury } from "@/lib/fred";
import { guard } from "@/lib/rateLimit";
import { dropDividendOutliers, projectNextExDate } from "@/lib/dividends";
import { forwardEstimate, revenueProjection } from "@/lib/forwardEstimates";
import { msGet as get, hitRateLimit } from "@/lib/marketstack";

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


// Concurrency-limited pool with NO fixed sleeps. The old approach paced fixed
// 1.1s gaps between batches, which ran even when every response came from the
// Next.js data cache — a fully-cached page load still took ~4.5s of pure sleep.
// A pool lets cached responses stream through instantly; only genuinely
// rate-limited calls pay for waiting, via get()'s backoff retries.
//
// Concurrency is adaptive rather than fixed. A fixed 2 was chosen because a
// burst of 4 drew 429s, but it costs every uncached load dearly: ten
// ticker-specific calls two at a time is five sequential rounds at ~0.9s each,
// which is most of the ~6s an uncached ticker measured end to end. Guessing a
// higher fixed number just moves the risk.
//
// So it opens at `limit` and collapses to serial the moment a call reports the
// upstream limit — `onLimited` inspects each result, and once it trips, every
// worker but the first retires. Where the plan tolerates the burst the fan-out
// is several times faster; where it doesn't, the tail runs at the old pace
// having spent one rate-limited call to find out, which get()'s backoff and
// negative cache already handle.
async function pool<T>(
  jobs: (() => Promise<T>)[],
  limit = 4,
  onLimited?: (r: T) => boolean
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  let throttled = false;
  async function worker(id: number) {
    while (next < jobs.length) {
      // Worker 0 always carries on, so the queue still drains once throttled.
      if (throttled && id > 0) return;
      const idx = next++;
      const r = await jobs[idx]();
      results[idx] = r;
      if (!throttled && onLimited?.(r)) throttled = true;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, jobs.length) }, (_, i) => worker(i))
  );
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 8);
  if (limited) return limited;
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);

  // Per-stage timings, returned only for ?debug=timings. Cheap enough to leave
  // in: without the flag the numbers are collected and dropped, and having them
  // measurable on production is the only way to find the real long pole — the
  // route can't be profiled locally without upstream keys.
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const timed = <R,>(label: string, fn: () => Promise<R>) => async (): Promise<R> => {
    const s0 = Date.now();
    try { return await fn(); } finally { marks[label] = Date.now() - s0; }
  };
  const wantTimings = req.nextUrl.searchParams.get("debug") === "timings";
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
  const factsPromise = timed("sec_facts", () => cikPromise.then((cik) => (cik ? fetchFacts(cik) : null)))();

  // Cheap validity gate BEFORE the full fanout. A single eod probe: if the
  // symbol returns no data (garbage-ticker enumeration — AAAA, AAAB, …), bail
  // after ONE upstream call instead of ~11. Legit tickers pay nothing extra —
  // the pooled eod below hits the exact same URL and is served from the Next
  // fetch cache. This caps quota-burn from the infinite garbage-symbol space,
  // which per-instance rate limiting alone can't (a distributed burst spreads
  // across serverless instances and resets each one's counter).
  // The probe doubles as the five-year pull rather than being a separate
  // request: it used to fetch its own 400-row window, whose URL the fan-out
  // then repeated as a cache hit — one upstream call, but still a full
  // round trip before anything else could start. Fetching the five-year series
  // here means the gate costs nothing extra, and the recent window is sliced
  // out of it below rather than fetched again.
  const eodUrl = `${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(5)}&limit=1400`;
  const probe = await timed("probe_eod_5y", () => get(eodUrl))();
  if (!rows(probe.data).some((r) => Number(r.close) > 0)) {
    return NextResponse.json(
      { error: probe.err ? `No price data (${probe.err})` : "Ticker not found" },
      { status: 404 }
    );
  }

  // Everything marketstack goes through ONE pool at concurrency 2 — their
  // per-second limit is strict enough that a burst of 4 parallel calls gets
  // some of them 429'd. Cached responses resolve in ~5ms, so a warm load
  // sails through the pool with no real serialization. eod/latest was
  // dropped: the eod series' newest row is the same data, one call cheaper.
  // Ratings and submissions sit at the end of the list where traffic is
  // thinnest — they're the endpoints most prone to 429.
  // Only the 10- and 15-year return anchors need dedicated fetches — the 1/3/5
  // year anchors are read out of the 5-year daily series we already pull below,
  // saving three upstream calls per uncached load. (Intraday was dropped along
  // with the research page's intraday panel; the header price is the last EOD.)
  const longHorizons = [10, 15];
  const [infoRes, divRes, splitRes, tickRes, ...tailRes] =
    await pool(
      [
        timed("tickerinfo", () => get(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`)),
        timed("dividends", () => get(`${MS}/dividends?access_key=${key}&symbols=${t}&limit=200`)),
        timed("splits", () => get(`${MS}/splits?access_key=${key}&symbols=${t}&limit=60`)),
        timed("tickers", () => get(`${MS}/tickers/${t}?access_key=${key}`)),
        ...longHorizons.map((y) => timed(`anchor_${y}y`, () =>
          get(`${MS}/eod?access_key=${key}&symbols=${t}&date_from=${anchorFor(y)}&sort=ASC&limit=1`)
        )),
        // SPY's five-year daily series, sampled to month-ends for the beta
        // regression. Published betas (Yahoo et al.) use 5-year monthly; a
        // 1-year daily window is a different statistic and produced a
        // nonsensical negative beta for defensive names like KO. The ticker's
        // own five-year series isn't fetched here — the probe above already is
        // that call. This one is shared by every ticker, so it's a cache hit
        // after the day's first request.
        timed("spy_5y", () => get(`${MS}/eod?access_key=${key}&symbols=SPY&date_from=${anchorFor(5)}&limit=1400`)),
        timed("submissions", async () => {
          const cik = await cikPromise;
          return cik
            ? get(`${MS}/submissions?access_key=${key}&cik_code=${cik}`)
            : { data: null, err: "no CIK" };
        }),
      ],
      4,
      hitRateLimit
    );
  const longAnchorRes = tailRes.slice(0, longHorizons.length);
  // The probe IS the ticker's five-year pull, so both the recent window and the
  // beta regression read from it rather than re-requesting the same series.
  const eodRes = probe;
  const stock5yRes = probe;
  const spy5yRes = tailRes[longHorizons.length];
  const subsRes = tailRes[longHorizons.length + 1];

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

  // Ascending 5-year daily series (adj_close) — the source for the 1/3/5-year
  // return anchors, so those no longer need their own API calls.
  const stock5yAsc = rows(stock5yRes?.data)
    .map((r) => ({ date: String(r.date ?? "").slice(0, 10), close: Number(r.adj_close ?? r.close ?? 0) }))
    .filter((r) => r.date && r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // First bar on or after a target date — mirrors the old anchor query
  // (date_from=…&sort=ASC&limit=1).
  const anchorFromSeries = (fromDate: string): { date: string; close: number } | null =>
    stock5yAsc.find((r) => r.date >= fromDate) ?? null;

  // ── Long-horizon returns (the 15-year entitlement, made visible) ──
  const longReturns = horizons.map((y) => {
    let row: { date: string; close: number } | null;
    if (y <= 5) {
      row = anchorFromSeries(anchorFor(y));
    } else {
      const raw = rows(longAnchorRes[longHorizons.indexOf(y)]?.data)[0];
      // adj_close, not close: raw closes across a split make old anchors look
      // 2-10x too expensive (KO's 2011 close is pre-2012-split).
      row = raw ? { date: String(raw.date ?? "").slice(0, 10), close: Number(raw.adj_close ?? raw.close) } : null;
    }
    const c = row ? row.close : 0;
    if (!(c > 0)) return { years: y, available: false as const };

    // A horizon longer than the listing history is NOT a return over that
    // horizon. Asking for a 15-year anchor on a 2021 IPO returns the first day
    // it traded, and reporting that as a 15-year figure understated IREN's
    // 4.8-year run as a 2.8%/yr fifteen-year CAGR — the same +51% appeared as
    // the 5-, 10- and 15-year row at three different annualisations. The span
    // is measured against what actually exists, and short ones say so.
    const spanYears =
      (Date.parse(last.date) - Date.parse(row!.date)) / (365.25 * 86400000);
    if (!(spanYears > 0)) return { years: y, available: false as const };
    if (spanYears < y * 0.9) {
      return { years: y, available: false as const, listedFrom: row!.date };
    }

    const total = ((last.close - c) / c) * 100;
    // Annualised over the real elapsed span, not the nominal horizon.
    const cagr = (Math.pow(last.close / c, 1 / spanYears) - 1) * 100;
    return {
      years: y,
      available: true as const,
      fromDate: row!.date,
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

  // Analyst ratings and consensus estimates are NOT assembled here. Timed on
  // production, companyratings alone ran ~3.8s on a cold ticker and consensus
  // ~2.2s, against ~600ms for everything else — so the whole payload waited on
  // the two slowest calls in the stack for a section nothing above the fold
  // needs. Both moved to /api/stock-analysts, which the page loads after this
  // one lands.
  // ── Dividends ──
  const divsRaw = rows(divRes.data)
    .map((r) => ({
      date: String(r.date ?? "").slice(0, 10),
      amount: Number(r.dividend ?? 0),
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : null,
      declarationDate: r.declaration_date ? String(r.declaration_date).slice(0, 10) : null,
      freq: r.distr_freq ?? null,
    }))
    .filter((r) => r.amount > 0);
  // The record itself stays intact — a lone outlier can be a genuine special
  // dividend (Microsoft's $3.08 in November 2004), and the history should show
  // what was actually paid. The bad-print guard is applied ONLY to the trailing
  // -twelve-month total, where a rogue value visibly corrupts the headline
  // yield and payout ratio (NVIDIA's bad $0.25 print put its payout at 4.3%
  // instead of ~0.5%). Trade-off accepted: a real special dividend inside the
  // last year would be left out of those two ratios, which understates rather
  // than wildly overstates.
  const divs = divsRaw;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = divs.filter((d) => d.date > today);
  const past = divs.filter((d) => d.date <= today);
  const ttmCutoff = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const { kept: ttmClean, dropped: droppedDivs } = dropDividendOutliers(divsRaw);
  const ttmTotal = ttmClean
    .filter((d) => d.date <= today && d.date >= ttmCutoff)
    .reduce((a, d) => a + d.amount, 0);

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
    // consensus, analysts and consensusForward are served by
    // /api/stock-analysts — see the note above the fan-out.
    // `forward` below is our own trend projection off SEC-filed results and
    // must never be presented as analyst consensus.
    // Revenue carried forward off the company's own filings. Consensus revenue
    // isn't free anywhere, so this is a projection and says so — it exists so
    // the revenue rows aren't blank on every loss-making company, where the
    // margin identity behind forward P/S can't work.
    forwardRevenue: revenueProjection(fundamentals?.revenue, {
      currentQuarterRevGrowth: fundamentals?.currentQuarterRevGrowth,
      revenueGrowth: fundamentals?.revenueGrowth,
      lastYearRevGrowth: fundamentals?.lastYearRevGrowth,
    }),
    forward: forwardEstimate(last.close, fundamentals?.eps, {
      currentQuarterEpsGrowth: fundamentals?.currentQuarterEpsGrowth,
      epsGrowth: fundamentals?.epsGrowth,
      lastYearEpsGrowth: fundamentals?.lastYearEpsGrowth,
    }),
    dividends: {
      recent: past.slice(0, 24),
      upcoming,
      // Declared payments only go a few weeks out, so between declarations
      // `upcoming` is empty for a company on a perfectly regular schedule.
      projectedNext: upcoming.length ? null : projectNextExDate(past),
      count: divs.length,
      oldest: divs.length ? divs[divs.length - 1].date : null,
      ttmTotal,
      yieldPct: ttmTotal > 0 && last.close > 0 ? (ttmTotal / last.close) * 100 : null,
      // Share of earnings paid out: TTM dividends per share ÷ TTM diluted EPS.
      // Needs both halves, so it's assembled here rather than inside the
      // EDGAR-only fundamentals derivation.
      payoutRatioPct:
        ttmTotal > 0 && fundamentals?.eps != null && fundamentals.eps > 0
          ? (ttmTotal / fundamentals.eps) * 100
          : null,
      freq: divs.find((d) => d.freq)?.freq ?? null,
      excludedOutliers: droppedDivs.length,
    },
    splits,
    fundamentals,
    filings: filings.map((f) => ({ ...f, url: filingUrl(f) })),
    meta: {
      cik,
      isin: tickMeta?.isin ?? null,
      errors: {
        profile: infoRes.err,
      },
    },
    ...(wantTimings ? { timings: { ...marks, total_ms: Date.now() - t0 } } : {}),
  }, {
    // Every upstream call here is fetched with a 24h revalidate, so the payload
    // is already a daily snapshot — an edge cache in front of it adds no
    // staleness the data doesn't already have. Without this the function re-ran
    // on every single load: ~500ms warm, ~6s cold, per visitor, per ticker.
    // The window is kept shorter than the other snapshot routes' 6h because
    // this one carries the quote the header prints.
    headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
