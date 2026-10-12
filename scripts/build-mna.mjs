// Builds data/mna.json — the M&A Activity feed.
//
// Source is MergerSight (mergersight.com), a student-run group that writes
// one structured analysis per deal. Each write-up opens with an "Overview of
// the deal" block — acquirer, target, value, dates, advisors — which is the
// factual record this snapshot keeps. The analysis itself stays theirs: the
// site shows those facts, a two-line excerpt, the authors' credit, and links
// to the full write-up on MergerSight.
//
// The site is a Wix blog. Its sitemap lists every post, and each blog
// category page (/blog/categories/<slug>/page/<n>, four posts a page) says
// which industry and deal type a post belongs to. Posts already in the
// snapshot are not fetched again, so the weekly run only reads what is new.
//
//   node scripts/build-mna.mjs            # incremental
//   node scripts/build-mna.mjs --full     # re-parse every post
//   node scripts/build-mna.mjs --limit 15 # quick check on a few posts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "mna.json");
const SITE = "https://www.mergersight.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 PrometheonEngine/1.0";
// Wix starts answering 429 at a few requests a second; one a second with a
// long back-off on a 429 gets through cleanly.
const PACE_MS = 1000;
const args = process.argv.slice(2);
const FULL = args.includes("--full");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 0;

// Industry categories as the blog names them, with the label the site shows.
const INDUSTRIES = [
  { slug: "healthcare",                   page: "healthcare",             key: "healthcare",  label: "Healthcare" },
  { slug: "consumer-retail",              page: "consumer-retail",        key: "consumer",    label: "Consumer & Retail" },
  { slug: "tech-media-telecommunication", page: "tmt",                    key: "tmt",         label: "Tech, Media & Telecom" },
  { slug: "industrials",                  page: "industrials",            key: "industrials", label: "Industrials" },
  { slug: "natural-resources",            page: "natural-resources",      key: "resources",   label: "Natural Resources" },
  { slug: "energy",                       page: "energy",                 key: "energy",      label: "Energy" },
  { slug: "financial-institution-group",  page: "financial-institutions", key: "financials",  label: "Financial Institutions" },
  { slug: "real-estate",                  page: "real-estate",            key: "realestate",  label: "Real Estate" },
];
const TYPES = [
  { slug: "m-a-reports",          key: "strategic", label: "Strategic M&A" },
  { slug: "strategic-m-a-moves",  key: "strategic", label: "Strategic M&A" },
  { slug: "strategic",            key: "strategic", label: "Strategic M&A" },
  { slug: "pe-reports",           key: "pe",        label: "Private Equity" },
  { slug: "ipo-reports",          key: "ipo",       label: "IPO" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchText(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xml" } });
      if (res.status === 404) return { status: 404, text: "" };
      if (res.status === 429) { await sleep(15000 * (i + 1)); continue; }
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, text: await res.text() };
    } catch (e) {
      if (i === tries - 1) { console.error(`  ! ${url}: ${e.message}`); return { status: 0, text: "" }; }
      await sleep(3000 * (i + 1));
    }
  }
  console.error(`  ! ${url}: still rate-limited after ${tries} tries`);
  return { status: 429, text: "" };
}

const postLinks = (html) => [...new Set(html.match(/https:\/\/www\.mergersight\.com\/post\/[a-z0-9-]+/g) ?? [])];

// Category pages: four posts a page, 404 past the end.
async function categoryPosts(slug) {
  const urls = [];
  for (let n = 1; n <= 60; n++) {
    const url = n === 1 ? `${SITE}/blog/categories/${slug}` : `${SITE}/blog/categories/${slug}/page/${n}`;
    const { status, text } = await fetchText(url);
    await sleep(PACE_MS);
    if (status !== 200) break;
    const links = postLinks(text).filter((u) => !urls.includes(u));
    if (!links.length) break;
    urls.push(...links);
  }
  return urls;
}

const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#0?39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;|&#160;| /g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function pageText(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "");
  return decode(body.replace(/<[^>]+>/g, "\n")).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
const meta = (html, prop) => {
  const m = new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i").exec(html)
    ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, "i").exec(html);
  return m ? decode(m[1]) : null;
};

// "$23bn", "$1.95bn", "$450m", "USD ~$21 billion" → USD number.
function parseMoney(s) {
  const m = /(?:US\$|USD\s*~?\$?|\$|€|£)\s*~?\s*([\d][\d,.]*)\s*(tn|trillion|bn|billion|b|mn|million|m)\b/i.exec(s ?? "");
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = m[2].toLowerCase();
  const mult = u.startsWith("t") ? 1e12 : u.startsWith("b") ? 1e9 : 1e6;
  const cur = /€/.test(m[0]) ? "EUR" : /£/.test(m[0]) ? "GBP" : "USD";
  return { amount: n * mult, currency: cur };
}

// "Abbott Laboratories (NYSE: ABT)" → ABT
function tickerOf(s) {
  const m = /\((?:NYSE|NASDAQ|Nasdaq|AMEX|NYSE American|NYSEARCA)\s*:\s*([A-Z][A-Z0-9.\-]{0,6})\)/.exec(s ?? "");
  return m ? m[1].replace(/\.$/, "") : null;
}
const stripTicker = (s) => (s ?? "").replace(/\s*\((?:[A-Z]+|[A-Za-z ]+)\s*:\s*[A-Z0-9.\-]+\)\s*/g, " ").replace(/\s+/g, " ").trim();

const MONEY = String.raw`(?:(?:US)?\$|€|£|C\$|A\$)\s?[\d.,]+\s?(?:tn|bn|b|mn|m|billion|million|trillion)?`;
function partiesFromTitle(title) {
  const t = title.replace(/\s+/g, " ").trim();
  const clean = (x) => x?.replace(/^(?:the|a)\s+/i, "").replace(/[’']s$/, "").replace(/\s*\(.*?\)\s*$/, "").trim() || null;
  let m;
  // "X's $23bn Acquisition of Y" / "X’s proposed $11.6 billion Acquisition of Y" / "DSV $16bn acquisition of Y"
  const ADJ = String.raw`(?:proposed|planned|completed|failed|landmark|pending|hostile|all-cash|all-stock)\s+`;
  if ((m = new RegExp(String.raw`^(.+?)(?:[’']s|s[’'])?\s+(?:${ADJ})?(?:${MONEY}\s+)?(?:${ADJ})?(?:acquisition|takeover|purchase|buyout|merger|investment|bid|offer|stake|spin-?off)\s+(?:of|with|in|for)\s+(.+?)(?:\s+for\s+${MONEY}.*|\s+in\s+(?:a|an)\s+${MONEY}.*)?$`, "i").exec(t)))
    return { acquirer: clean(m[1]), target: clean(m[2]) };
  // "X to acquire Y" / "X acquires Y for $2bn" / "X completes acquisition of Y" / "X agrees to buy Y"
  if ((m = new RegExp(String.raw`^(.+?)\s+(?:to\s+acquire|acquires|acquired|acquiring|agrees?\s+to\s+(?:acquire|buy)|set\s+to\s+acquire|complet(?:es?|ing)\s+(?:its\s+)?acquisition\s+of|buys|to\s+buy|takes\s+over|snaps\s+up|announces\s+acquisition\s+of|looks\s+to\s+acquire)\s+(.+?)(?:\s+(?:for|in)\s+(?:a\s+|an\s+)?${MONEY}.*|\s+deal.*)?$`, "i").exec(t)))
    return { acquirer: clean(m[1]), target: clean(m[2]) };
  // "X and Y agree $54bn merger" / "X–Y merger"
  if ((m = new RegExp(String.raw`^(.+?)\s+(?:and|&)\s+(.+?)\s+(?:agree|announce|complete|to)\s+.*merger`, "i").exec(t)))
    return { acquirer: clean(m[1]), target: clean(m[2]) };
  return { acquirer: null, target: null };
}

function parsePost(url, html) {
  const lines = pageText(html);
  const title = meta(html, "og:title")?.replace(/\s*\|\s*MergerSight.*$/i, "") ?? lines.find((l) => l.length > 10) ?? url;
  const published = (meta(html, "article:published_time") ?? "").slice(0, 10) || null;
  const byline = lines.find((l) => /^By [A-Z]/.test(l) && l.length < 400) ?? null;

  // The overview block: "Label: value" pairs (value sometimes on the next
  // line) until the first real paragraph.
  const startIdx = lines.findIndex((l) => /^(overview of the (deal|transaction|ipo)|summary of (the )?(deal|ipo)|deal overview|ipo overview)/i.test(l));
  const fields = [];
  let excerpt = null;
  if (startIdx >= 0) {
    for (let i = startIdx + 1; i < Math.min(lines.length, startIdx + 60); i++) {
      const l = lines[i];
      // A label is a short run of words before a colon — no parentheses or
      // digits, so "Abbott Laboratories (NYSE: ABT)" is a value, not a label.
      const LABEL = /^([A-Z][A-Za-z /&'’\-]{1,40}):\s*(.*)$/;
      // A long advisor list is a field value, not the opening paragraph.
      const looksLikeAdvisors = /\((financial|legal)\)|\bLLP\b|\bLLC\b/i.test(l);
      const m = LABEL.exec(l);
      if (m) {
        let value = m[2].trim();
        if (!value && lines[i + 1] && !LABEL.test(lines[i + 1])) { value = lines[++i].trim(); }
        if (value) fields.push({ label: m[1].trim(), value });
      } else if (l.length > 220 && !looksLikeAdvisors) { excerpt = l; break; }
      else if (fields.length && l.length > 120 && !looksLikeAdvisors) { excerpt = l; break; }
    }
  }
  if (!excerpt) excerpt = lines.find((l, i) => i > startIdx && l.length > 220 && !/\((financial|legal)\)|\bLLP\b/i.test(l)) ?? null;
  // Labels are matched whole, so "Acquirer advisor" can't stand in for
  // "Acquirer".
  const find = (re) => fields.find((f) => re.test(f.label.trim()))?.value ?? null;
  const acquirerLine = find(/^(the )?(acquirer|acquiror|buyer|bidder|sponsor|acquiring company)s?$/i) ?? find(/^(acquirer|buyer)\b(?!.*advis)/i);
  const targetLine = find(/^(the )?(target|target company|company|issuer|seller)s?$/i) ?? find(/^target\b(?!.*advis)/i);
  const valueLine = find(/transaction size|transaction value|deal value|deal size|estimated value|enterprise value|implied enterprise|offer value|total consideration|purchase price|amount raised|proceeds|valuation|market cap/i)
    ?? find(/equity value/i) ?? find(/value|size|price/i);
  const headline = parseMoney(title) ?? parseMoney(valueLine);

  const type = /\bipo\b/i.test(title) ? "ipo" : null;
  // Older write-ups have no overview block, but their titles follow a
  // pattern — "Roche's $7.1bn acquisition of Telavant", "AstraZeneca to
  // acquire Alexion", "Luxottica and Essilor agree $54bn merger" — so the
  // parties come from the title when the block is missing.
  return {
    url, title, published, byline,
    acquirer: stripTicker(acquirerLine) || null, acquirerTicker: tickerOf(acquirerLine),
    target: stripTicker(targetLine) || null, targetTicker: tickerOf(targetLine),
    value: headline?.amount ?? null, currency: headline?.currency ?? null,
    announced: find(/announc/i), closed: find(/clos|complet|expected/i),
    fields, excerpt: excerpt ? excerpt.slice(0, 320).replace(/\s+\S*$/, "") + (excerpt.length > 320 ? "…" : "") : null,
    typeHint: type,
  };
}

// ── main ──
const prev = existsSync(OUT) && !FULL ? JSON.parse(readFileSync(OUT, "utf8")) : { deals: [] };
const known = new Map(prev.deals.map((d) => [d.url, d]));

// The site files a post under an industry in two places: the blog category
// (paginated, four a page) and the industry page in its own navigation,
// which shows the most recent write-ups and sometimes files a deal the
// category misses (Healthpeak under Real Estate as well as Healthcare). Both
// count as the site's own tag.
console.log("Reading category and industry pages…");
const industryOf = new Map();
const tag = (u, key) => { const cur = industryOf.get(u) ?? []; if (!cur.includes(key)) industryOf.set(u, [...cur, key]); };
for (const ind of INDUSTRIES) {
  const urls = await categoryPosts(ind.slug);
  for (const u of urls) tag(u, ind.key);
  const page = await fetchText(`${SITE}/${ind.page}`);
  await sleep(PACE_MS);
  const onPage = postLinks(page.text);
  for (const u of onPage) tag(u, ind.key);
  console.log(`  ${ind.label}: ${urls.length} in category, ${onPage.length} on its page`);
}
const typeOf = new Map();
for (const ty of TYPES) {
  const urls = await categoryPosts(ty.slug);
  for (const u of urls) if (!typeOf.has(u)) typeOf.set(u, ty.key);
  console.log(`  ${ty.label} (${ty.slug}): ${urls.length}`);
}

// Older posts predate the blog categories, so the sitemap fills in the rest;
// those carry no industry and appear only under "All". Non-deal posts
// (newsletters, interviews, trend pieces) are dropped after parsing.
console.log("Reading post sitemap…");
const sitemap = await fetchText(`${SITE}/blog-posts-sitemap.xml`);
const sitemapUrls = postLinks(sitemap.text);
console.log(`  ${sitemapUrls.length} posts in sitemap${sitemap.status !== 200 ? ` (HTTP ${sitemap.status})` : ""}`);
let urls = [...new Set([...industryOf.keys(), ...typeOf.keys(), ...sitemapUrls])];
if (LIMIT) urls = urls.slice(0, LIMIT);
const toFetch = urls.filter((u) => !known.has(u));
console.log(`${urls.length} posts in scope, ${toFetch.length} to fetch`);

let done = 0;
for (const u of toFetch) {
  const { status, text } = await fetchText(u);
  await sleep(PACE_MS);
  if (status !== 200 || !text) continue;
  try {
    known.set(u, parsePost(u, text));
  } catch (e) {
    console.error(`  ! parse ${u}: ${e.message}`);
  }
  if (++done % 25 === 0) console.log(`  ${done}/${toFetch.length}`);
}

// Posts older than the blog's category tags carry no industry. The title,
// parties and opening paragraph usually say what the business is, so those
// are classified by keyword and flagged as inferred; a post nothing matches
// stays unfiled and shows only under "All".
// Each industry has strong terms (two points) and weak ones (one point); the
// best-supported industry wins, and it needs at least a strong term or two
// weak ones. Tech's generic words ("platform", "digital") are weak on
// purpose — they turned a car merger into a TMT deal.
const INDUSTRY_WORDS = [
  ["healthcare",  /pharma|biotech|therapeutic|medical|hospital|oncolog|genomic|diagnostic|medtech|vaccine|surgical|clinic|life science|drug|healthcare|health care|biopharm/gi, /\bbio\b|patients?\b|\bcare\b|wellness|\bfda\b|clinical/gi],
  ["financials",  /\bbank|bancorp|bancshares|insurer|insurance|asset manag|wealth manag|brokerage|fintech|lending|mortgage|reinsur|annuit|securities\b|exchange group|stock exchange|financial services|capital markets|payments?\b|asset management/gi, /financial|\bfund\b|\bcredit\b|\bloans?\b|deposits?\b/gi],
  ["energy",      /\boil\b|\bgas\b|petroleum|pipeline|refin|\blng\b|shale|drilling|utility|utilities|solar|wind farm|renewable|nuclear|electricity|offshore wind|midstream|upstream|power distribution|hydrogen/gi, /energy|\bgrid\b|barrels?\b/gi],
  ["resources",   /mining|\bminer\b|\bgold\b|copper|lithium|\bsteel\b|aluminium|aluminum|chemical|fertili[sz]er|iron ore|cement|timber|forest products|agri(?:culture|business)|commodit|\bmetals?\b|nickel|\bcoal\b|paper\b/gi, /resources|materials|\bmine\b/gi],
  ["realestate",  /real estate|\breit\b|property|properties|realty|landlord|office portfolio|logistics park|housing|retirement living|senior living|data centre portfolio/gi, /estate|buildings|tenant/gi],
  ["tmt",         /software|semiconductor|\bchips?\b|cloud|\bsaas\b|cyber|data cent|telecom|wireless|broadband|streaming|video game|gaming|social media|advertis|\bmusic\b|publishing|entertainment|satellite|e-?commerce|internet|\bmedia\b|\bapps?\b|artificial intelligence/gi, /technolog|\btech\b|digital|platform|\bai\b|online|network/gi],
  ["industrials", /aerospace|defen[cs]e|industrial|machinery|engineering|automotive|carmaker|vehicle|truck|\brail|shipping|logistics|freight|packaging|construction|infrastructure|conglomerate|elevator|equipment|manufactur|aviation|airport|hvac|climate technolog|\bauto\b|\bmotors?\b|container/gi, /parts\b|supplier|fleet|components|factory|factories/gi],
  ["consumer",    /retail|consumer|\bfood|beverage|drinks?\b|brewer|spirits|restaurant|grocer|supermarket|apparel|fashion|luxury|cosmetic|beauty|footwear|sportswear|hotel|leisure|travel|airline|cruise|casino|tobacco|pet food|\btoys?\b|household|cannabis|coffee|snack|confection/gi, /\bbrands?\b|stores?\b|shopp/gi],
];
function inferIndustry(d) {
  const text = [d.title, d.acquirer, d.target, d.excerpt].filter(Boolean).join(" ");
  let best = null, bestScore = 0;
  for (const [key, strong, weak] of INDUSTRY_WORDS) {
    const score = 2 * new Set([...text.matchAll(strong)].map((m) => m[0].toLowerCase())).size
      + new Set([...text.matchAll(weak)].map((m) => m[0].toLowerCase())).size;
    if (score > bestScore) { best = key; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}
const cleanParty = (v) => (v && !/advis|\(financial\)|\(legal\)/i.test(v) ? v : null);

const isDeal = (d) =>
  d.fields.length > 0 || /acquisition|acquire|merger|merge|takeover|buyout|\bipo\b|spin-?off|combination|offer for|to buy|deal/i.test(d.title);
const deals = urls
  .map((u) => known.get(u))
  .filter((d) => d && isDeal(d))
  .map((d) => {
    const tagged = industryOf.get(d.url) ?? [];
    const inferred = tagged.length ? null : inferIndustry(d);
    const fromTitle = d.type === "ipo" || /\bipo\b/i.test(d.title) ? { acquirer: null, target: null } : partiesFromTitle(d.title);
    return {
      ...d,
      acquirer: cleanParty(d.acquirer) ?? fromTitle.acquirer, target: cleanParty(d.target) ?? fromTitle.target,
      industries: tagged.length ? tagged : inferred ? [inferred] : [],
      industryInferred: !tagged.length && !!inferred,
      type: typeOf.get(d.url) ?? d.typeHint ?? "strategic",
    };
  })
  .sort((a, b) => String(b.published ?? "").localeCompare(String(a.published ?? "")));

const parsed = deals.filter((d) => d.fields.length > 0).length;
console.log(`Parsed overview blocks on ${parsed}/${deals.length} posts`);
if (deals.length < 20 && !LIMIT) {
  console.error("Too few deals — keeping the existing snapshot.");
  process.exit(existsSync(OUT) ? 0 : 1);
}
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: { name: "MergerSight", url: SITE },
  industries: INDUSTRIES.map(({ key, label }) => ({ key, label })),
  types: [...new Map(TYPES.map((t) => [t.key, { key: t.key, label: t.label }])).values()],
  count: deals.length,
  deals,
}, null, 1) + "\n", "utf8");
console.log(`Wrote ${deals.length} deals to data/mna.json`);
