// Builds the earnings calendar as a static data file.
//
// Why precompute: the calendar needs one SEC submissions fetch per company, and
// SEC allows ~10 requests/second. Doing that at request time meant a 1–4 minute
// scan that a serverless request can't finish and instances can't share, so the
// page just sat on skeletons. The dates are projections off filing cadence and
// only shift when a company reschedules, so a periodically-regenerated snapshot
// is both accurate and instant.
//
// Run:  node scripts/build-earnings-calendar.mjs
// Out:  data/earnings-calendar.json
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";
const MS = "https://api.marketstack.com/v2";
const FUNDS = [
  { ticker: "VOO", tag: "sp500" },
  { ticker: "IJH", tag: "mid" },
  { ticker: "IJR", tag: "small" },
];

function envKey() {
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(resolve(ROOT, f), "utf8").match(/^MARKETSTACK_KEY\s*=\s*"?([^"\r\n]+)"?/m);
      if (m) return m[1].trim();
    } catch {}
  }
  throw new Error("MARKETSTACK_KEY not found in .env.local/.env");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.ok) return await res.json();
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        await sleep(2000 * (i + 1));
        continue;
      }
      return null;
    } catch {
      await sleep(1000 * (i + 1));
    }
  }
  return null;
}

const SUFFIXES =
  /\b(incorporated|inc|corporation|corp|company|co|plc|ltd|limited|holdings?|group|the|sa|nv|ag|lp|trust|reit|class\s+[abc]|cl\s+[abc]|com|new)\b/g;
function norm(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/&amp;/g, "&").toLowerCase().trim();
  s = s.replace(/\/[a-z]{2,4}\/?\s*$/, "");
  s = s.replace(/[^a-z0-9& ]/g, " ").replace(/\band\b/g, "&").replace(SUFFIXES, " ");
  s = s.replace(/\s+/g, " ").trim().replace(/\s*&\s*$/, "").trim();
  return s.replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1").replace(/\s+/g, " ").trim();
}
const sortedKey = (raw) => norm(raw).split(" ").filter(Boolean).sort().join(" ");

const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const gap = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);
const weekday = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mode = (xs) => {
  const c = new Map();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  let best = null, n = 0;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
};

function project(sub, today) {
  const r = sub?.filings?.recent;
  if (!r?.form) return null;
  const items = r.items ?? [];
  const dates = [];
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] === "8-K" && String(items[i] ?? "").includes("2.02")) {
      dates.push(String(r.filingDate[i]).slice(0, 10));
    }
  }
  const dd = [];
  for (const d of dates) if (!dd.length || gap(dd[dd.length - 1], d) >= 45) dd.push(d);
  if (!dd.length) return null;

  let next;
  if (dd.length >= 4) {
    next = addDays(dd[3], 365);
  } else {
    const gaps = [];
    for (let i = 0; i < dd.length - 1; i++) gaps.push(gap(dd[i], dd[i + 1]));
    next = addDays(dd[0], gaps.length ? Math.round(median(gaps)) : 91);
  }
  while (next < today) next = addDays(next, 365);

  // +365 slides the weekday by one; companies keep a consistent reporting day.
  const usual = mode(dd.slice(0, 8).map(weekday));
  if (usual != null) {
    for (let shift = 0; shift <= 3; shift++) {
      const back = addDays(next, -shift), fwd = addDays(next, shift);
      if (weekday(back) === usual && back >= today) { next = back; break; }
      if (weekday(fwd) === usual) { next = fwd; break; }
    }
  }
  return { next, last: dd[0] };
}

async function main() {
  // --refresh re-projects dates for the universe already in the snapshot,
  // instead of rebuilding it from ETF holdings.
  //
  // The universe needs a marketstack key; the dates don't — they come from SEC
  // submissions. Index membership drifts slowly while the projections go stale
  // in weeks, so tying a date refresh to having the key made the calendar
  // decay whenever the key wasn't to hand. This keeps the two independent.
  const refreshOnly = process.argv.includes("--refresh");
  const key = refreshOnly ? null : envKey();
  const today = new Date().toISOString().slice(0, 10);

  process.stdout.write("Resolving SEC ticker map… ");
  const map = await getJson("https://www.sec.gov/files/company_tickers.json", {
    "User-Agent": SEC_UA, Accept: "application/json",
  });
  if (!map) throw new Error("SEC ticker map unavailable");
  const byExact = new Map(), bySorted = new Map();
  for (const k of Object.keys(map)) {
    const row = map[k];
    if (!row?.ticker) continue;
    const e = {
      ticker: String(row.ticker).toUpperCase(),
      cik: String(row.cik_str).padStart(10, "0"),
      name: String(row.title ?? row.ticker).replace(/\s*\/[A-Z]{2,4}\/?\s*$/, "").trim(),
    };
    const a = norm(row.title), b = sortedKey(row.title);
    if (a && !byExact.has(a)) byExact.set(a, e);
    if (b && !bySorted.has(b)) bySorted.set(b, e);
  }
  console.log(`${Object.keys(map).length} registrants`);

  const seen = new Set();
  const companies = [];

  if (refreshOnly) {
    const prev = JSON.parse(readFileSync(resolve(ROOT, "data/earnings-calendar.json"), "utf8"));
    for (const e of prev.entries ?? []) {
      const hit = byExact.get(norm(e.name)) ?? bySorted.get(sortedKey(e.name));
      // The snapshot carries no CIK, so each ticker is re-resolved through the
      // SEC map; a name that no longer matches is looked up by ticker instead.
      const cik = hit?.cik ?? [...Object.values(map)].find(
        (r) => String(r?.ticker).toUpperCase() === e.ticker
      )?.cik_str;
      if (!cik) continue;
      if (seen.has(e.ticker)) continue;
      seen.add(e.ticker);
      companies.push({
        ticker: e.ticker,
        cik: String(cik).padStart(10, "0"),
        name: e.name,
        tag: e.sp500 ? "sp500" : "other",
      });
    }
    console.log(`Universe: ${companies.length} companies carried over from the previous snapshot\n`);
  }

  for (const f of refreshOnly ? [] : FUNDS) {
    const raw = await getJson(`${MS}/etfholdings?access_key=${key}&ticker=${f.ticker}`);
    const holdings = raw?.output?.holdings ?? [];
    let matched = 0;
    const batch = new Map();
    for (const h of holdings) {
      const nm = (h.investment_security ?? h)?.name;
      if (!nm || nm === "N/A") continue;
      const hit = byExact.get(norm(nm)) ?? bySorted.get(sortedKey(nm));
      if (hit && !seen.has(hit.ticker)) { batch.set(hit.ticker, { ...hit, tag: f.tag }); matched++; }
    }
    for (const c of [...batch.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))) {
      seen.add(c.ticker);
      companies.push(c);
    }
    console.log(`${f.ticker}: ${holdings.length} holdings → ${matched} resolved`);
  }
  if (!refreshOnly) console.log(`Universe: ${companies.length} companies\n`);

  const entries = [];
  let done = 0, failed = 0;
  // SEC asks for no more than 10 requests/second. Five workers with no pacing
  // burst past that across ~750 companies, and sustained 403s exhausted even
  // the five-try backoff — a refresh dropped 181 companies whose CIKs fetch
  // perfectly well one at a time. Three workers with a quarter-second gap sits
  // near 7/s and holds.
  const CONC = 3;
  const PACE_MS = 250;
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (idx < companies.length) {
        const c = companies[idx++];
        const sub = await getJson(`https://data.sec.gov/submissions/CIK${c.cik}.json`, {
          "User-Agent": SEC_UA, Accept: "application/json",
        });
        done++;
        await sleep(PACE_MS);
        if (done % 50 === 0) process.stdout.write(`  ${done}/${companies.length} (${entries.length} dated)\n`);
        if (!sub) { failed++; continue; }
        const p = project(sub, today);
        if (!p) continue;
        entries.push({
          ticker: c.ticker,
          name: String(sub.name ?? c.name).replace(/&amp;/g, "&").replace(/\s*\/[A-Z]{2,4}\/?\s*$/, "").trim(),
          next: p.next,
          sp500: c.tag === "sp500",
        });
      }
    })
  );

  entries.sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : a.ticker.localeCompare(b.ticker)));
  const out = {
    generatedAt: new Date().toISOString(),
    universe: companies.length,
    sp500Count: entries.filter((e) => e.sp500).length,
    entries,
  };
  mkdirSync(resolve(ROOT, "data"), { recursive: true });
  writeFileSync(resolve(ROOT, "data/earnings-calendar.json"), JSON.stringify(out, null, 0));
  console.log(`\nDone: ${entries.length} dated (${out.sp500Count} S&P 500), ${failed} failed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
