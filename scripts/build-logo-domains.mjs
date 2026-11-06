// Builds data/logo-domains.json — each company's website host, keyed by ticker.
//
// /api/logo turns a ticker into a logo by finding the company's website and
// fetching its icon. Finding the website used to cost a paid lookup per
// ticker, and a page such as the earnings calendar asks for fifty logos at
// once: some lookups were throttled and those companies showed no logo. This
// snapshot answers the website question up front for the S&P 500 and every
// US-listed company worth $10B or more, so the route only falls back to the
// live lookup for the long tail.
//
// Websites almost never change, so the script is incremental: it only looks up
// tickers it has not resolved before, and re-tries known blanks after 60 days.
//
//   node scripts/build-logo-domains.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const OUT = join(DATA, "logo-domains.json");
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};
const MIN_CAP = 1e10;
const PACE_MS = 350;
const RETRY_BLANK_DAYS = 60;

const keyOf = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date().toISOString().slice(0, 10);

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const domains = { ...(prev.domains ?? {}) };
const blanks = { ...(prev.blanks ?? {}) };

// Who needs a logo: index members plus anything large.
const wanted = new Map(); // key -> symbol in dotted form (BRK.B)
for (const t of JSON.parse(readFileSync(join(DATA, "sp500.json"), "utf8")).tickers ?? []) wanted.set(keyOf(t), t);
try {
  const res = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true", { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
  for (const r of (await res.json())?.data?.rows ?? []) {
    const sym = String(r?.symbol ?? "").toUpperCase().replace(/\//g, ".");
    if (Number(r?.marketCap) >= MIN_CAP && /^[A-Z][A-Z0-9.]{0,9}$/.test(sym) && !wanted.has(keyOf(sym))) wanted.set(keyOf(sym), sym);
  }
} catch (e) {
  console.error(`Screener unavailable (${e?.message ?? e}); resolving index members only.`);
}

const stale = (d) => (Date.now() - Date.parse(d)) / 864e5 > RETRY_BLANK_DAYS;
const todo = [...wanted].filter(([k]) => !domains[k] && (!blanks[k] || stale(blanks[k])));
console.log(`${wanted.size} tickers wanted, ${todo.length} to look up.`);

let found = 0, failed = 0;
for (const [key, sym] of todo) {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(sym)}/company-profile`, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) { failed++; await sleep(PACE_MS * 4); continue; } // throttled or down: try again next run
    const url = (await res.json())?.data?.CompanyUrl?.value;
    let host = null;
    try { host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase(); } catch { /* blank or malformed */ }
    if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) { domains[key] = host; delete blanks[key]; found++; }
    else blanks[key] = today;
  } catch { failed++; }
  await sleep(PACE_MS);
}

if (!found && !Object.keys(prev.domains ?? {}).length) {
  console.error("Resolved nothing and there is no earlier snapshot.");
  process.exit(1);
}
if (found || todo.length) {
  const sort = (o) => Object.fromEntries(Object.entries(o).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(OUT, JSON.stringify({ updated: today, domains: sort(domains), blanks: sort(blanks) }) + "\n");
}
console.log(`Resolved ${found} new, ${failed} failed, ${Object.keys(domains).length} total, ${Object.keys(blanks).length} blank.`);
