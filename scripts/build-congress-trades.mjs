// Builds the congressional trading feed as a static data file.
//
// Why precompute: assembling a chamber-wide picture means one HTTP round trip
// per filing — ~370 House PDFs and ~100 Senate report pages for a single year.
// That is minutes of fetching against two government hosts that must be treated
// gently, so it can't happen inside a request. Disclosures arrive in bursts on
// filing deadlines and never change once filed, so a regenerated snapshot is
// both accurate and instant.
//
// The two chambers publish nothing alike:
//
//   House  — disclosures-clerk.house.gov ships a yearly ZIP holding an XML
//            index of every filing. FilingType "P" is a Periodic Transaction
//            Report, the one that carries trades. The index gives only a DocID;
//            the trades live in the PDF it points at. Those PDFs are ENCRYPTED
//            (/Standard /V 2 /R 3 — 128-bit RC4, empty user password, set for
//            permissions rather than secrecy). Naive extraction reads the
//            streams as binary noise, which is what makes these look like
//            scans. They are not scans: decrypt and a full text layer is there.
//            unpdf (pdf.js) handles the empty-password case transparently.
//            DocIDs of 8 digits starting with "2" are e-filed and carry that
//            text layer; shorter IDs are genuine paper scans and are skipped.
//
//   Senate — efdsearch.senate.gov gates everything behind a one-time terms
//            acceptance: GET the search home for a CSRF token, POST it back
//            with prohibition_agreement=1, and the session cookie unlocks a
//            JSON endpoint. Reports under /search/view/ptr/ are real HTML
//            tables with a dedicated ticker column — cleaner than the House
//            PDFs. Reports under /search/view/paper/ are scans and are skipped.
//
// Two kinds of filing yield no rows, and both are expected rather than failures:
// paper scans (no text layer), and filings that disclose only bonds, municipal
// debt, hedge funds or private stock — assets with no ticker. Roughly a third of
// House PTRs are the latter, dominated by Treasury and muni holdings. Both are
// counted and reported in the snapshot so the page can state its coverage
// instead of silently implying completeness.
//
// Run:  node scripts/build-congress-trades.mjs [--years 2026,2025] [--limit N]
// Out:  data/congress-trades.json
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { extractText, getDocumentProxy } from "unpdf";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Prometheon Engine (matthanasab@gmail.com)";
const HOUSE = "https://disclosures-clerk.house.gov/public_disc";
const SENATE = "https://efdsearch.senate.gov";

const argv = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const YEARS = argOf("--years", String(new Date().getFullYear()))
  .split(",")
  .map((y) => y.trim())
  .filter(Boolean);
const LIMIT = Number(argOf("--limit", "0")) || 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retry(fn, tries = 4, label = "") {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (i < tries - 1) await sleep(600 * 2 ** i);
    }
  }
  throw new Error(`${label}: ${last?.message ?? last}`);
}

// Runs jobs with a fixed worker pool so neither host sees a burst.
async function pool(items, size, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await worker(items[i], i);
      }
    })
  );
  return out;
}

/* ------------------------------- normalising ------------------------------ */

// Disclosure amounts are ranges, never exact figures — the STOCK Act only
// requires a bracket. Keep the label verbatim and derive bounds for sorting.
function parseAmount(raw) {
  const nums = [...String(raw).matchAll(/\$([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (!nums.length) return { label: String(raw).trim(), low: null, high: null };
  return {
    label: String(raw).replace(/\s+/g, " ").trim(),
    low: nums[0],
    high: nums.length > 1 ? nums[1] : nums[0],
  };
}

function normalizeAction(raw) {
  const s = String(raw).toLowerCase();
  if (s.startsWith("p") || s.includes("purchase")) return "purchase";
  if (s.includes("exchange")) return "exchange";
  if (s.includes("partial")) return "sale_partial";
  if (s.startsWith("s") || s.includes("sale") || s.includes("sold")) return "sale";
  return "other";
}

function isoDate(mdy) {
  const m = String(mdy).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

// Tickers appear as "Apple Inc. - Common Stock (AAPL) [ST]". Reject the
// parentheticals that aren't tickers at all.
const NOT_TICKERS = new Set(["ST", "OP", "PS", "OL", "RP", "AB", "CS", "EF", "FN", "GS", "IH", "MF"]);
function cleanTicker(t) {
  const s = String(t || "").trim().toUpperCase();
  if (!s || s.length > 6 || NOT_TICKERS.has(s)) return null;
  if (!/^[A-Z][A-Z.\-]*$/.test(s)) return null;
  return s;
}

/* --------------------------------- House ---------------------------------- */

async function houseIndex(year) {
  const buf = await retry(async () => {
    const res = await fetch(`${HOUSE}/financial-pdfs/${year}FD.zip`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }, 4, `house index ${year}`);

  // Minimal ZIP reader: one local file header per entry, deflate or stored.
  const entries = [];
  let i = 0;
  while ((i = buf.indexOf("PK\x03\x04", i, "latin1")) >= 0) {
    const method = buf.readUInt16LE(i + 8);
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString("latin1");
    const start = i + 30 + nameLen + extraLen;
    if (compSize > 0) {
      const body = buf.subarray(start, start + compSize);
      entries.push({ name, data: method === 0 ? body : inflateRawSync(body) });
      i = start + compSize;
    } else {
      i = start;
    }
  }
  const xml = entries.find((e) => e.name.toLowerCase().endsWith(".xml"));
  if (!xml) throw new Error(`no XML in ${year}FD.zip`);

  const text = xml.data.toString("utf8");
  const field = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : "";
  };
  return [...text.matchAll(/<Member>([\s\S]*?)<\/Member>/g)]
    .map((m) => m[1])
    .filter((b) => field(b, "FilingType") === "P")
    .map((b) => ({
      last: field(b, "Last"),
      first: field(b, "First"),
      state: field(b, "StateDst"),
      filingDate: field(b, "FilingDate"),
      docId: field(b, "DocID"),
      year,
    }));
}

// A transaction block looks like:
//   Amazon.com, Inc. - Common Stock (AMZN) [ST]
//   S (partial) 03/16/2026 03/16/2026 $1,001 - $15,000
const HOUSE_TX =
  /\(([A-Z][A-Z.\-]{0,5})\)\s*\[[A-Z]{2}\][\s\S]{0,40}?\b(P|S \(partial\)|S|E)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\$[\d,]+\s*-\s*\$[\d,]+)/g;

function parseHousePdfText(text, filing) {
  const flat = text.replace(/\s+/g, " ");
  const out = [];
  for (const m of flat.matchAll(HOUSE_TX)) {
    const ticker = cleanTicker(m[1]);
    if (!ticker) continue;
    const date = isoDate(m[3]);
    if (!date) continue;
    out.push({
      chamber: "house",
      member: `${filing.first} ${filing.last}`.replace(/\s+/g, " ").trim(),
      state: filing.state || null,
      ticker,
      action: normalizeAction(m[2]),
      transactionDate: date,
      disclosedDate: isoDate(m[4]) || isoDate(filing.filingDate),
      amount: parseAmount(m[5]),
      source: `${HOUSE}/ptr-pdfs/${filing.year}/${filing.docId}.pdf`,
    });
  }
  return out;
}

async function scrapeHouse(year, stats) {
  const filings = await houseIndex(year);
  const efiled = filings.filter((f) => /^2\d{7}$/.test(f.docId));
  stats.housePaperSkipped += filings.length - efiled.length;
  stats.housePtrTotal += filings.length;

  const work = LIMIT ? efiled.slice(0, LIMIT) : efiled;
  console.log(`  House ${year}: ${filings.length} PTRs — ${work.length} e-filed to parse, ${filings.length - efiled.length} paper skipped`);

  let done = 0;
  const results = await pool(work, 4, async (f) => {
    try {
      const rows = await retry(async () => {
        const res = await fetch(`${HOUSE}/ptr-pdfs/${f.year}/${f.docId}.pdf`, { headers: { "User-Agent": UA } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
        const { text } = await extractText(doc, { mergePages: true });
        return parseHousePdfText(text, f);
      }, 3, `house ptr ${f.docId}`);
      if (!rows.length) stats.houseEmpty++;
      return rows;
    } catch {
      stats.houseFailed++;
      return [];
    } finally {
      if (++done % 40 === 0) console.log(`    ...${done}/${work.length}`);
      await sleep(120);
    }
  });
  return results.flat();
}

/* --------------------------------- Senate --------------------------------- */

// The portal refuses everything until the prohibition notice is accepted, so
// the session is established once and its cookies reused for the whole run.
async function senateSession() {
  const jar = new Map();
  const absorb = (res) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const home = `${SENATE}/search/home/`;
  const r1 = await fetch(home, { headers: { "User-Agent": UA } });
  absorb(r1);
  const html = await r1.text();
  const token = html.match(/name=['"]csrfmiddlewaretoken['"]\s+value=['"]([^'"]+)/)?.[1];
  if (!token) throw new Error("no CSRF token on Senate search home");

  const r2 = await fetch(home, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: home,
      Cookie: cookie(),
    },
    body: new URLSearchParams({ prohibition_agreement: "1", csrfmiddlewaretoken: token }),
    redirect: "manual",
  });
  absorb(r2);
  if (!jar.has("sessionid")) throw new Error("Senate session cookie not issued");
  return { cookie, csrf: () => jar.get("csrftoken") };
}

async function scrapeSenate(year, stats) {
  const s = await senateSession();
  const home = `${SENATE}/search/home/`;

  const rows = [];
  for (let start = 0; ; start += 100) {
    const res = await retry(
      () =>
        fetch(`${SENATE}/search/report/data/`, {
          method: "POST",
          headers: {
            "User-Agent": UA,
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: home,
            Cookie: s.cookie(),
            "X-CSRFToken": s.csrf(),
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams({
            start: String(start),
            length: "100",
            report_types: "[11]", // Periodic Transaction Report
            filer_types: "[]",
            submitted_start_date: `01/01/${year} 00:00:00`,
            submitted_end_date: `12/31/${year} 23:59:59`,
            candidate_state: "",
            senator_state: "",
            office_id: "",
            first_name: "",
            last_name: "",
            csrfmiddlewaretoken: s.csrf(),
          }),
        }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
      3,
      "senate list"
    );
    rows.push(...(res.data ?? []));
    if (rows.length >= (res.recordsTotal ?? 0) || !res.data?.length) break;
    await sleep(300);
  }

  const reports = rows
    .map((r) => {
      const href = String(r[3]).match(/href="([^"]+)"/)?.[1];
      return href ? { href, first: String(r[0]).trim(), last: String(r[1]).trim() } : null;
    })
    .filter(Boolean);

  const electronic = reports.filter((r) => r.href.includes("/ptr/"));
  stats.senatePaperSkipped += reports.length - electronic.length;
  stats.senatePtrTotal += reports.length;

  const work = LIMIT ? electronic.slice(0, LIMIT) : electronic;
  console.log(`  Senate ${year}: ${reports.length} PTRs — ${work.length} electronic to parse, ${reports.length - electronic.length} paper skipped`);

  const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

  const results = await pool(work, 3, async (rep) => {
    try {
      const html = await retry(
        () =>
          fetch(`${SENATE}${rep.href}`, { headers: { "User-Agent": UA, Cookie: s.cookie(), Referer: home } })
            .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        3,
        `senate ${rep.href}`
      );
      const out = [];
      for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
        const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => strip(c[1]));
        // # | Transaction Date | Owner | Ticker | Asset Name | Asset Type | Type | Amount | Comment
        if (cells.length < 8 || !/^\d+$/.test(cells[0])) continue;
        const ticker = cleanTicker(cells[3]);
        const date = isoDate(cells[1]);
        if (!ticker || !date) continue;
        out.push({
          chamber: "senate",
          member: `${rep.first} ${rep.last}`.replace(/\s+/g, " ").trim(),
          state: null,
          ticker,
          action: normalizeAction(cells[6]),
          transactionDate: date,
          disclosedDate: null,
          amount: parseAmount(cells[7]),
          source: `${SENATE}${rep.href}`,
        });
      }
      if (!out.length) stats.senateEmpty++;
      return out;
    } catch {
      stats.senateFailed++;
      return [];
    } finally {
      await sleep(150);
    }
  });
  return results.flat();
}

/* ---------------------------------- main ---------------------------------- */

const stats = {
  housePtrTotal: 0, housePaperSkipped: 0, houseEmpty: 0, houseFailed: 0,
  senatePtrTotal: 0, senatePaperSkipped: 0, senateEmpty: 0, senateFailed: 0,
};

const all = [];
for (const year of YEARS) {
  console.log(`\nYear ${year}`);
  const [house, senate] = await Promise.all([
    scrapeHouse(year, stats).catch((e) => (console.error(`  House ${year} failed: ${e.message}`), [])),
    scrapeSenate(year, stats).catch((e) => (console.error(`  Senate ${year} failed: ${e.message}`), [])),
  ]);
  all.push(...house, ...senate);
}

// The same trade can appear in both an original and an amended filing.
// Filings occasionally carry a mistyped transaction date — a trade dated in the
// future, or notified before it happened. Those are errors in the source
// document, not parse failures, so the value is kept as filed and marked rather
// than corrected or dropped.
const TODAY = new Date().toISOString().slice(0, 10);
for (const t of all) {
  t.suspectDate =
    t.transactionDate > TODAY || (t.disclosedDate != null && t.disclosedDate < t.transactionDate);
}

const seen = new Set();
const trades = all
  .filter((t) => {
    const k = `${t.chamber}|${t.member}|${t.ticker}|${t.transactionDate}|${t.action}|${t.amount.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  })
  .sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : 0));

const snapshot = {
  generatedAt: new Date().toISOString(),
  years: YEARS,
  trades,
  coverage: {
    ...stats,
    tradesParsed: trades.length,
    suspectDates: trades.filter((t) => t.suspectDate).length,
    members: new Set(trades.map((t) => t.member)).size,
    tickers: new Set(trades.map((t) => t.ticker)).size,
    note:
      "Paper (scanned) filings are excluded — they carry no text layer. Amounts are the ranges the STOCK Act requires; exact values are never disclosed.",
  },
};

mkdirSync(resolve(ROOT, "data"), { recursive: true });
writeFileSync(resolve(ROOT, "data/congress-trades.json"), JSON.stringify(snapshot), "utf8");

console.log(`\nWrote data/congress-trades.json`);
console.log(`  ${trades.length} trades · ${snapshot.coverage.members} members · ${snapshot.coverage.tickers} tickers`);
console.log(`  House: ${stats.housePtrTotal} PTRs (${stats.housePaperSkipped} paper skipped, ${stats.houseFailed} failed, ${stats.houseEmpty} no trades found)`);
console.log(`  Senate: ${stats.senatePtrTotal} PTRs (${stats.senatePaperSkipped} paper skipped, ${stats.senateFailed} failed, ${stats.senateEmpty} no trades found)`);
