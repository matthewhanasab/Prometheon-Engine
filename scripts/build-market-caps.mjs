// Builds data/market-caps.json — market value, in $ billions, of every US-listed
// company worth $2B or more.
//
// The earnings calendar ranks each day by size and offers a "Top names" view
// ($100B+). Scheduled weeks carry a market cap on every row, but weeks beyond
// the announced schedule are projected from past reporting dates and carry
// none, which left them sorted alphabetically and the Top names view empty.
// This snapshot fills that gap. Size moves slowly enough that a weekly refresh
// is plenty for ranking and for a $100B cut-off.
//
//   node scripts/build-market-caps.mjs
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "market-caps.json");
const URL_ = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&download=true";
const MIN = 2e9;

const keep = (why) => {
  console.error(`${why}; keeping the existing snapshot.`);
  process.exit(existsSync(OUT) ? 0 : 1);
};

let rows;
try {
  const res = await fetch(URL_, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) keep(`Screener returned HTTP ${res.status}`);
  rows = (await res.json())?.data?.rows;
} catch (e) {
  keep(`Screener request failed (${e?.message ?? e})`);
}
if (!Array.isArray(rows)) keep("Screener response had no rows");

// Keys match lib/earningsCalendar's tickerKey: letters and digits only, so
// BRK/B here and BRK.B on the calendar meet at BRKB.
const caps = {};
for (const r of rows) {
  const cap = Number(r?.marketCap);
  const key = String(r?.symbol ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key || !Number.isFinite(cap) || cap < MIN) continue;
  const bn = Math.round(cap / 1e7) / 100;
  if (!(key in caps) || bn > caps[key]) caps[key] = bn;
}

// Roughly 170 companies sit above $100B and well over a thousand above $2B. A
// count far below that means the feed changed shape.
const n = Object.keys(caps).length;
const mega = Object.values(caps).filter((v) => v >= 100).length;
if (n < 800 || mega < 60) keep(`Parsed ${n} companies (${mega} above $100B) — implausibly few`);

const sorted = Object.fromEntries(Object.entries(caps).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), unit: "USD billions", caps: sorted }) + "\n");
console.log(`Wrote ${n} companies (${mega} above $100B).`);
