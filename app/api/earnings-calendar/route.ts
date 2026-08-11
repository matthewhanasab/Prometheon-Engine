import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";

// Upcoming corporate earnings calendar — built entirely from SEC EDGAR.
//
// No feed in our data stack carries earnings dates (marketstack has none, and no
// analyst calendar is licensed), so we derive them from the primary source.
// Every US filer announces quarterly results in an 8-K tagged item 2.02
// ("Results of Operations and Financial Condition"); those filing dates ARE the
// company's real historical earnings-announcement dates. For each watchlist name
// we read its 2.02 history and project the NEXT date by anchoring to the same
// fiscal quarter one year earlier — robust to 52/53-week retail fiscal calendars
// and to companies that file more than one 2.02 in a quarter.
//
// The most recent date is confirmed (as filed with the SEC). The upcoming date
// is an expectation projected from that cadence — not a company-announced date.
const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";

// A spread of widely-followed US filers across sectors. Foreign issuers file
// 6-K/20-F instead of 8-K item 2.02 and are intentionally omitted.
const WATCHLIST = [
  "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "AMD", "NFLX",
  "JPM", "V", "MA", "BAC", "GS", "JNJ", "UNH", "LLY", "XOM", "CVX",
  "WMT", "COST", "HD", "KO", "PEP", "MCD", "NKE", "DIS", "PG", "ORCL",
  "CRM", "ADBE", "INTC", "PLTR", "UBER", "SBUX", "CAT", "BA", "QCOM", "GE",
];

type Entry = {
  ticker: string;
  name: string;
  cik: string;
  last: string;   // confirmed most-recent earnings-announcement date
  next: string;   // expected next date (projected)
  regular: boolean;
};

async function secGet(url: string, ttl: number): Promise<any | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
      next: { revalidate: ttl },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const dayGap = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function projectOne(ticker: string, cik: string): Promise<Entry | null> {
  const sub = await secGet(`https://data.sec.gov/submissions/CIK${cik}.json`, 43200); // 12h
  const r = sub?.filings?.recent;
  if (!r?.form) return null;
  const items: string[] = r.items ?? [];

  // Every 8-K carrying item 2.02 is an earnings-results announcement. The arrays
  // are newest-first; keep those filing dates.
  const dates: string[] = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === "8-K" && String(items[i] ?? "").includes("2.02")) {
      dates.push(String(r.filingDate[i]).slice(0, 10));
    }
  }
  // Collapse clustered filings (a company can file two 2.02 8-Ks in one quarter)
  // to roughly one per quarter so the cadence isn't polluted.
  const dd: string[] = [];
  for (const d of dates) if (!dd.length || dayGap(dd[dd.length - 1], d) >= 45) dd.push(d);
  if (!dd.length) return null;

  const last = dd[0];
  const now = today();
  let next: string;
  let regular = false;

  if (dd.length >= 4) {
    // The next report is the same fiscal quarter as the one four filings back,
    // advanced a year — this respects uneven fiscal calendars.
    next = addDays(dd[3], 365);
    const gaps: number[] = [];
    for (let i = 0; i < Math.min(dd.length - 1, 5); i++) gaps.push(dayGap(dd[i], dd[i + 1]));
    regular = gaps.every((g) => g >= 75 && g <= 110);
  } else {
    const gaps: number[] = [];
    for (let i = 0; i < dd.length - 1; i++) gaps.push(dayGap(dd[i], dd[i + 1]));
    next = addDays(last, gaps.length ? Math.round(median(gaps)) : 91);
  }
  while (next < now) next = addDays(next, 365);

  const name = String(sub.name ?? ticker).replace(/&amp;/g, "&").replace(/\s*\/[A-Z]{2}\/?\s*$/, "").trim();
  return { ticker, name, cik, last, next, regular };
}

/** Bounded-concurrency map so we stay polite to data.sec.gov. */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: NextRequest) {
  const limited = guard(req, 20);
  if (limited) return limited;

  // One small, cached map resolves every ticker → CIK + name.
  const map = await secGet("https://www.sec.gov/files/company_tickers.json", 86400);
  if (!map) {
    return NextResponse.json({ error: "SEC ticker map unavailable — not available with current data." }, { status: 502 });
  }
  const cikByTicker = new Map<string, string>();
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (row?.ticker) cikByTicker.set(String(row.ticker).toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }

  const resolved = WATCHLIST.map((t) => ({ t, cik: cikByTicker.get(t) })).filter((x) => x.cik) as { t: string; cik: string }[];
  const results = await pool(resolved, 6, ({ t, cik }) => projectOne(t, cik));
  const entries = results.filter((e): e is Entry => !!e).sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.ticker.localeCompare(b.ticker)));

  return NextResponse.json(
    { asOf: today(), count: entries.length, entries },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
