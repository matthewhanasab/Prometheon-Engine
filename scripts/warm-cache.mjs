// Keeps the site's caches warm for the tickers people actually open.
//
// A research page for a ticker nobody has looked at today costs ~2.5s: a
// dozen upstream calls to the price feed and EDGAR. The same page with those
// calls already in the framework's data cache answers in ~0.4s, and with the
// edge cache warm in ~0.1s. Every deploy empties the edge cache, and the data
// cache entries expire on their own schedules — so this walks the busiest
// tickers through every heavy route on a timer (see .github/workflows/
// warm-cache.yml) and the first real visitor gets the fast path.
//
// Paced to stay under the site's own per-IP rate limiter (220 cost units a
// minute): about seven tickers a minute.
//
//   node scripts/warm-cache.mjs            # full list
//   node scripts/warm-cache.mjs --quick    # defaults only
const SITE = process.env.SITE_URL ?? "https://www.prometheonengine.com";
const QUICK = process.argv.includes("--quick");

// The pages' default tickers first, then the names most visited.
const DEFAULTS = ["AAPL", "MSFT", "GOOGL", "NVDA", "AMD", "TSLA", "KO"];
const POPULAR = [
  "AMZN", "META", "BRK.B", "AVGO", "LLY", "JPM", "V", "UNH", "XOM", "MA", "COST", "HD", "PG", "JNJ",
  "WMT", "NFLX", "BAC", "ABBV", "CRM", "ORCL", "CVX", "MRK", "KO", "PEP", "AMD", "ADBE", "TMO", "CSCO",
  "MCD", "ACN", "LIN", "DIS", "WFC", "ABT", "INTU", "QCOM", "GS", "TXN", "IBM", "CAT", "PLTR", "MU",
  "UBER", "SHOP", "COIN", "SOFI", "RIVN", "LCID", "RBLX", "IREN",
];
const TICKERS = [...new Set(QUICK ? DEFAULTS : [...DEFAULTS, ...POPULAR])];

// Cost units per call match lib/rateLimit guard() weights.
const PER_TICKER = (t) => [
  [`/api/marketstack-stock/${t}`, 8],
  [`/api/stock-analysts/${t}`, 8],
  [`/api/consensus/${t}`, 2],
  [`/api/ms-charts/${t}`, 3],
  [`/api/ms-financials/${t}`, 3],
  [`/api/segments/${t}`, 2],
  [`/api/stock-etfs/${t}`, 10],
  [`/api/marketstack-dividends/${t}`, 3],
  [`/api/insider?symbol=${t}`, 6],
];
const SHARED = [
  ["/api/macro", 2], ["/api/markets", 2], ["/api/earnings-calendar", 3], ["/api/mna", 2],
  ["/api/congress-trades", 2], ["/api/insider", 6],
  ["/api/etf-compare?tickers=SPY,QQQ,VTI,ARKK", 4], ["/api/etf/SPY", 4], ["/api/etf/QQQ", 4],
  ["/", 0], ["/research", 0], ["/compare", 0], ["/charts", 0], ["/earnings", 0], ["/macro", 0], ["/mna", 0],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let spent = 0, windowStart = Date.now();
async function hit(path, cost) {
  // Budget: 200 units per rolling minute, with headroom under the 220 cap.
  if (Date.now() - windowStart > 60_000) { spent = 0; windowStart = Date.now(); }
  if (spent + cost > 200) { await sleep(60_000 - (Date.now() - windowStart) + 500); spent = 0; windowStart = Date.now(); }
  spent += cost;
  const t0 = Date.now();
  try {
    const res = await fetch(SITE + path, { headers: { "User-Agent": "PrometheonEngine cache warmer" } });
    await res.arrayBuffer();
    return `${res.status} ${Date.now() - t0}ms ${res.headers.get("x-vercel-cache") ?? ""}`;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

console.log(`Warming ${TICKERS.length} tickers on ${SITE}`);
for (const [path, cost] of SHARED) console.log(`  ${await hit(path, cost)}  ${path}`);
for (const t of TICKERS) {
  const results = await Promise.all(PER_TICKER(t).map(([p, c]) => hit(p, c)));
  console.log(`  ${t.padEnd(6)} ${results.map((r) => r.split(" ")[0]).join(" ")}`);
  await sleep(1500);
}
console.log("Done.");
