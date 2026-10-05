// Builds data/sp500.json — the current S&P 500 constituent tickers.
//
// The earnings calendar's "S&P 500" view used to trust a flag derived from an
// ETF-holdings pull, which had quietly lost a fifth of the index: 400 names
// flagged instead of ~500, so PepsiCo and Delta were on the calendar but hidden
// from the default view. Membership is its own fact and changes a few times a
// quarter, so it gets its own small snapshot.
//
// Source is the constituents table on Wikipedia, read through the MediaWiki API
// as wikitext (stable markup, unlike the rendered HTML). Key-free.
//
//   node scripts/build-sp500.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "sp500.json");
const URL_ =
  "https://en.wikipedia.org/w/api.php?action=parse&page=List_of_S%26P_500_companies&prop=wikitext&section=1&format=json";

const res = await fetch(URL_, {
  headers: { "User-Agent": "PrometheonEngine/1.0 (snapshot refresh; prometheonengine.com)" },
});
if (!res.ok) {
  console.error(`Wikipedia returned HTTP ${res.status}; keeping the existing list.`);
  process.exit(existsSync(OUT) ? 0 : 1);
}
const wikitext = (await res.json())?.parse?.wikitext?.["*"] ?? "";

// Each row's ticker sits in an exchange template: {{NyseSymbol|MMM}},
// {{NasdaqSymbol|AAPL}}, {{BZX link|CBOE}} …
const tickers = [...new Set(
  [...wikitext.matchAll(/\{\{(?:NyseSymbol|NasdaqSymbol|BZX link|BZX|NYSE American link)\|([A-Z.]+)/g)]
    .map((m) => m[1])
)].sort();

// The index holds ~503 lines (a few companies have two share classes). A count
// far from that means the page's markup changed, and overwriting a good list
// with a broken parse would empty the calendar's default view.
if (tickers.length < 480 || tickers.length > 520) {
  console.error(`Parsed ${tickers.length} tickers — outside the plausible range; keeping the existing list.`);
  process.exit(existsSync(OUT) ? 0 : 1);
}

// Leave the file untouched when membership hasn't changed, so the scheduled
// job doesn't commit a new timestamp every week.
if (existsSync(OUT)) {
  try {
    const prev = JSON.parse(readFileSync(OUT, "utf8"));
    if (JSON.stringify(prev.tickers) === JSON.stringify(tickers)) {
      console.log(`S&P 500 list unchanged (${tickers.length} tickers).`);
      process.exit(0);
    }
  } catch { /* unreadable previous file — rewrite it */ }
}

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: tickers.length, tickers }, null, 1) + "\n", "utf8");
console.log(`Wrote ${tickers.length} S&P 500 tickers to data/sp500.json`);
