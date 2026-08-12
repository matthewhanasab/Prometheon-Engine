import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { resolveUniverse, UniverseKey } from "@/lib/earningsUniverse";

// Upcoming corporate earnings calendar — built entirely from SEC EDGAR.
//
// No feed in our data stack carries earnings dates, so they're derived from the
// primary source. Every US filer announces quarterly results in an 8-K tagged
// item 2.02 ("Results of Operations and Financial Condition"); those filing
// dates ARE the company's real historical earnings-announcement dates, and the
// filing's acceptance timestamp tells us whether it went out before the open or
// after the close.
//
// Scanning ~500–1300 companies can't finish inside one request from cold, so the
// route works to a time budget and returns what it has with `complete: false`.
// Each upstream fetch is cached for 12h, so a follow-up request replays the
// finished companies instantly and pushes the frontier further — the client
// polls until complete, and the whole universe stays warm for the rest of the day.
// SEC's ~10 req/s ceiling puts a floor under the scan: ~65s for the S&P 500,
// ~3min for the S&P 1500. Given the room, one request finishes the job and the
// CDN then serves it for six hours, so only the first visitor in a window waits.
export const maxDuration = 300;

const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";
const BUDGET_MS = 240_000;  // headroom inside maxDuration
const CONCURRENCY = 5;      // SEC asks for ≤10/s; stay well under it

export type Session = "bmo" | "amc" | "other";

// Per-company results memoised on the instance. The framework's fetch cache
// can't be relied on here — measured in dev, every poll restarted from company
// zero and the scan could never finish. Module state on a warm Node instance
// does persist (the same property lib/rateLimit.ts depends on), so a follow-up
// poll replays finished companies for free and pushes the frontier onward.
// Per-instance, so a cold instance rescans; the CDN caches the completed
// response for everyone once any instance gets there.
type Memo = { entry: Entry | null; ts: number };
const memo = new Map<string, Memo>();
const MEMO_TTL_MS = 12 * 3600 * 1000;

type Entry = {
  ticker: string;
  name: string;
  last: string;
  next: string;
  session: Session;
  regular: boolean;
};

// SEC throttles above ~10 requests/second and answers 403/429. Without a retry
// those companies come back empty and silently vanish — JPM, GS, BAC, WFC and
// PFE all dropped out of an S&P 500 scan despite filing 2.02 on a clean
// quarterly cadence, and the entry count wobbled between runs. Sustained
// over-calling earns a longer IP block, so the backoff is generous and the
// concurrency deliberately sits below their stated ceiling.
async function secGet(url: string, tries = 4): Promise<any | null> {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": SEC_UA, Accept: "application/json" },
        next: { revalidate: 43200 },
      });
      if (res.ok) return await res.json();
      if ((res.status === 403 || res.status === 429 || res.status >= 500) && attempt < tries - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      return null;
    } catch {
      if (attempt === tries - 1) return null;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

const today = () => new Date().toISOString().slice(0, 10);
const dayGap = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekdayOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mode = <T,>(xs: T[]): T | null => {
  const c = new Map<T, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
};

/**
 * Which trading session a filing went out in, from its acceptance timestamp
 * converted to New York time (EDGAR stamps UTC; the offset shifts with DST, so
 * this defers to the zone database rather than assuming −5).
 */
function sessionOf(acceptanceIso: string): Session | null {
  if (!acceptanceIso) return null;
  const d = new Date(acceptanceIso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (!Number.isFinite(h)) return null;
  const t = (h % 24) + m / 60;
  if (t < 9.5) return "bmo";
  if (t >= 16) return "amc";
  return "other";
}

function projectOne(sub: any, ticker: string, fallbackName: string): Entry | null {
  const r = sub?.filings?.recent;
  if (!r?.form) return null;
  const items: string[] = r.items ?? [];
  const accepted: string[] = r.acceptanceDateTime ?? [];

  const dates: string[] = [];
  const sessions: Session[] = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== "8-K" || !String(items[i] ?? "").includes("2.02")) continue;
    dates.push(String(r.filingDate[i]).slice(0, 10));
    const s = sessionOf(String(accepted[i] ?? ""));
    if (s) sessions.push(s);
  }
  // Collapse clustered filings (some filers post more than one 2.02 a quarter)
  // so the cadence isn't polluted.
  const dd: string[] = [];
  for (const d of dates) if (!dd.length || dayGap(dd[dd.length - 1], d) >= 45) dd.push(d);
  if (!dd.length) return null;

  const last = dd[0];
  const now = today();
  let next: string;
  let regular = false;

  if (dd.length >= 4) {
    // The next report is the same fiscal quarter as four filings back, advanced
    // a year — this respects uneven 52/53-week fiscal calendars.
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

  // A year is 52 weeks plus a day, so a straight +365 slides the weekday. Firms
  // report on a consistent weekday, and on a calendar the column matters — snap
  // to the company's usual day when it's within a few days.
  const usual = mode(dd.slice(0, 8).map(weekdayOf));
  if (usual != null) {
    for (let shift = 0; shift <= 3; shift++) {
      const back = addDays(next, -shift), fwd = addDays(next, shift);
      if (weekdayOf(back) === usual && back >= now) { next = back; break; }
      if (weekdayOf(fwd) === usual) { next = fwd; break; }
    }
  }

  const name = String(sub.name ?? fallbackName)
    .replace(/&amp;/g, "&")
    .replace(/\s*\/[A-Z]{2,4}\/?\s*$/, "")
    .trim();

  return { ticker, name, last, next, session: mode(sessions.slice(0, 6)) ?? "other", regular };
}

export async function GET(req: NextRequest) {
  const limited = guard(req, 20);
  if (limited) return limited;

  const which: UniverseKey = req.nextUrl.searchParams.get("universe") === "all" ? "all" : "sp500";
  const companies = await resolveUniverse(which);
  if (!companies.length) {
    return NextResponse.json(
      { error: "Company universe unavailable — not available with current data." },
      { status: 502 }
    );
  }

  const started = Date.now();
  const entries: Entry[] = [];
  let done = 0;
  let idx = 0;
  let ranOut = false;

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (idx < companies.length) {
        const c = companies[idx++];

        const hit = memo.get(c.cik);
        if (hit && Date.now() - hit.ts < MEMO_TTL_MS) {
          done++;
          if (hit.entry) entries.push(hit.entry);
          continue;
        }
        // Only stop before doing new network work — replaying the memo is free,
        // so a resumed scan always gets past everything it already knows.
        if (Date.now() - started > BUDGET_MS) { ranOut = true; return; }

        const sub = await secGet(`https://data.sec.gov/submissions/CIK${c.cik}.json`);
        done++;
        if (!sub) continue; // transient failure: leave unmemoised so it retries
        const e = projectOne(sub, c.ticker, c.name);
        memo.set(c.cik, { entry: e, ts: Date.now() });
        if (e) entries.push(e);
      }
    })
  );

  const complete = !ranOut && done >= companies.length;

  entries.sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.ticker.localeCompare(b.ticker)));

  return NextResponse.json(
    {
      universe: which,
      asOf: today(),
      progress: { done, total: companies.length, complete },
      entries,
    },
    {
      // Only a finished scan may be cached. Caching a partial one froze the
      // All Stocks universe at 319/1335 for six hours — every poll was served
      // the same truncated response from the CDN, so it could never finish.
      headers: {
        "Cache-Control": complete
          ? "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400"
          : "public, max-age=0, s-maxage=0, must-revalidate",
      },
    }
  );
}
