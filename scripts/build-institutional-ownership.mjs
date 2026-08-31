// Builds institutional ownership from SEC Form 13F as a static data file.
//
// Every institutional manager with over $100M under discretion must file a 13F
// listing its US equity positions each quarter, so "who owns this company" is
// public — but only from the holder's side. There is no per-issuer endpoint;
// the answer for one ticker only exists once every filing has been read. SEC
// publishes the quarter as one ~100MB ZIP (INFOTABLE.tsv alone is ~400MB
// uncompressed, ~3.8M rows), which is why this runs offline and ships a
// snapshot rather than living in a request.
//
// Three things in this data will quietly produce wrong numbers:
//
//   1. Managers file under many entities. BlackRock appears repeatedly, and
//      Vanguard files as a dozen separate LLCs. Grouping by FILINGMANAGER_NAME
//      collapses distinct filers and loses their shares; the identity that
//      actually works is the CIK from SUBMISSION.tsv.
//   2. Amendments are two different things. A RESTATEMENT replaces the original
//      filing; a NEW HOLDINGS amendment adds to it. Treating them alike either
//      double-counts or drops positions.
//   3. Duplicate filings exist verbatim — two accessions reporting the same
//      953,847,648 shares was what first exposed this.
//
// Getting those wrong put Apple at 52.8% institutional against a published
// ~62%. Handled properly it lands at 62.4% of shares outstanding, with
// BlackRock, Vanguard, State Street, Geode and FMR at the top, which is the
// real holder list.
//
// Options positions (PUTCALL set) and share-equivalents (SSHPRNAMTTYPE other
// than SH) are excluded — neither is ownership of stock.
//
// Run:  node scripts/build-institutional-ownership.mjs
// Out:  data/institutional-ownership.json   (keyed by CUSIP)
//
// Memory: the per-(issuer, filer) map runs to a few million entries. If node
// runs out of heap, re-run with --max-old-space-size=4096.
import { createWriteStream, createReadStream, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";
import { createInflateRaw } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const UA = "Prometheon Engine (matthanasab@gmail.com)";
const INDEX = "https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets";
const TMP = resolve(ROOT, ".13f-tmp.zip");

// Keep a CUSIP only once a handful of managers report it — below that the row
// is noise rather than an ownership picture, and the tail is most of the file.
const MIN_FILERS = 5;
const TOP_HOLDERS = 10;

/* ------------------------------- zip reading ------------------------------ */

// Reads entries straight out of the ZIP by streaming each one through raw
// inflate. INFOTABLE.tsv is ~400MB expanded, so it is never held in memory.
function zipEntries(path) {
  const size = statSync(path).size;
  const tailLen = Math.min(size, 66_000);
  const fd = readFileSync(path, { flag: "r" }).subarray(size - tailLen);
  const eocd = fd.lastIndexOf("PK\x05\x06", undefined, "latin1");
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = fd.readUInt16LE(eocd + 10);
  let cd = fd.readUInt32LE(eocd + 16);

  const whole = readFileSync(path);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (whole.toString("latin1", cd, cd + 4) !== "PK\x01\x02") break;
    const method = whole.readUInt16LE(cd + 10);
    const compSize = whole.readUInt32LE(cd + 20);
    const nameLen = whole.readUInt16LE(cd + 28);
    const extraLen = whole.readUInt16LE(cd + 30);
    const commentLen = whole.readUInt16LE(cd + 32);
    const localOff = whole.readUInt32LE(cd + 42);
    const name = whole.toString("latin1", cd + 46, cd + 46 + nameLen);
    // The local header repeats the name/extra lengths, and its extra field can
    // differ in length from the central one — so the data offset is read there.
    const lNameLen = whole.readUInt16LE(localOff + 26);
    const lExtraLen = whole.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    entries.push({ name, method, start, compSize });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function* tsvRows(path, entry) {
  const raw = createReadStream(path, { start: entry.start, end: entry.start + entry.compSize - 1 });
  const stream = entry.method === 0 ? raw : raw.pipe(createInflateRaw());
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    const cells = line.split("\t");
    if (!header) { header = cells; continue; }
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? "";
    yield row;
  }
}

/* --------------------------------- fetch ---------------------------------- */

async function latestDatasetUrl() {
  const res = await fetch(INDEX, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`dataset index HTTP ${res.status}`);
  const html = await res.text();
  const hrefs = [...html.matchAll(/href="([^"]*form-13f-data-sets\/[^"]*\.zip)"/g)].map((m) => m[1]);
  if (!hrefs.length) throw new Error("no dataset links found on the index page");

  // Filenames come in two shapes across years — "2023q4_form13f.zip" and
  // "01mar2026-31may2026_form13f.zip" — so the newest is picked by the date the
  // name encodes rather than by sorting the strings.
  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const rank = (h) => {
    const range = h.match(/(\d{2})([a-z]{3})(\d{4})-(\d{2})([a-z]{3})(\d{4})/i);
    if (range) return Number(range[6]) * 100 + (MON[range[5].toLowerCase()] ?? 0);
    const q = h.match(/(\d{4})q([1-4])/i);
    if (q) return Number(q[1]) * 100 + Number(q[2]) * 3;
    return 0;
  };
  const best = hrefs.sort((a, b) => rank(b) - rank(a))[0];
  return new URL(best, "https://www.sec.gov").toString();
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

/* ---------------------------------- main ---------------------------------- */

const url = await latestDatasetUrl();
console.log(`Dataset: ${url}`);
await download(url, TMP);
console.log(`  downloaded ${(statSync(TMP).size / 1e6).toFixed(0)}MB`);

const entries = zipEntries(TMP);
const find = (n) => {
  const e = entries.find((x) => x.name.toUpperCase().endsWith(n));
  if (!e) throw new Error(`${n} missing from dataset`);
  return e;
};

// ── SUBMISSION: accession -> CIK, the only reliable filer identity ──
const cikOf = new Map();
for await (const r of tsvRows(TMP, find("SUBMISSION.TSV"))) {
  cikOf.set(r.ACCESSION_NUMBER, r.CIK);
}
console.log(`  ${cikOf.size.toLocaleString()} submissions`);

// ── COVERPAGE: pick the reporting quarter and resolve amendments ──
const cover = [];
const quarters = new Map();
for await (const r of tsvRows(TMP, find("COVERPAGE.TSV"))) {
  cover.push(r);
  quarters.set(r.REPORTCALENDARORQUARTER, (quarters.get(r.REPORTCALENDARORQUARTER) ?? 0) + 1);
}
// A window contains stragglers reporting older quarters; the mode is the one
// this dataset is actually about.
const quarter = [...quarters.entries()].sort((a, b) => b[1] - a[1])[0][0];
console.log(`  reporting quarter: ${quarter}`);

const byCik = new Map();
for (const r of cover) {
  if (r.REPORTCALENDARORQUARTER !== quarter) continue;
  const cik = cikOf.get(r.ACCESSION_NUMBER);
  if (!cik) continue;
  let slot = byCik.get(cik);
  if (!slot) byCik.set(cik, (slot = { base: null, add: [] }));
  if (r.ISAMENDMENT === "Y" && r.AMENDMENTTYPE === "NEW HOLDINGS") slot.add.push(r.ACCESSION_NUMBER);
  else if (slot.base === null || r.ACCESSION_NUMBER > slot.base) slot.base = r.ACCESSION_NUMBER;
}
const accToCik = new Map();
for (const [cik, slot] of byCik) {
  if (slot.base) accToCik.set(slot.base, cik);
  for (const a of slot.add) accToCik.set(a, cik);
}
const managerName = new Map();
for (const r of cover) {
  if (accToCik.has(r.ACCESSION_NUMBER)) managerName.set(accToCik.get(r.ACCESSION_NUMBER), r.FILINGMANAGER_NAME);
}
console.log(`  ${byCik.size.toLocaleString()} managers, ${accToCik.size.toLocaleString()} filings kept`);

// ── INFOTABLE: shares per (issuer, filer) ──
const issuerName = new Map();
const pair = new Map(); // `${cusip} ${cik}` -> shares
let scanned = 0;
for await (const r of tsvRows(TMP, find("INFOTABLE.TSV"))) {
  if (++scanned % 1_000_000 === 0) console.log(`    ...${(scanned / 1e6).toFixed(0)}M rows`);
  if (r.SSHPRNAMTTYPE !== "SH" || r.PUTCALL) continue;
  const cik = accToCik.get(r.ACCESSION_NUMBER);
  if (!cik) continue;
  const shares = Number(r.SSHPRNAMT);
  if (!Number.isFinite(shares) || shares <= 0) continue;
  const cusip = String(r.CUSIP || "").trim().toUpperCase();
  if (cusip.length !== 9) continue;
  // Filers occasionally use a placeholder where they have no CUSIP; 000000000
  // otherwise accumulates unrelated issuers into one nonsense record.
  if (/^(.)\1{8}$/.test(cusip)) continue;
  const k = `${cusip} ${cik}`;
  pair.set(k, (pair.get(k) ?? 0) + shares);
  if (!issuerName.has(cusip)) issuerName.set(cusip, r.NAMEOFISSUER);
}
console.log(`  ${scanned.toLocaleString()} holding rows scanned`);

// ── Collapse to per-issuer totals and a top-holder list ──
const issuers = new Map();
for (const [k, shares] of pair) {
  const i = k.indexOf(" ");
  const cusip = k.slice(0, i);
  const cik = k.slice(i + 1);
  let e = issuers.get(cusip);
  if (!e) issuers.set(cusip, (e = { shares: 0, filers: 0, holders: [] }));
  e.shares += shares;
  e.filers += 1;
  e.holders.push([cik, shares]);
}

const out = {};
let kept = 0;
for (const [cusip, e] of issuers) {
  if (e.filers < MIN_FILERS) continue;
  kept++;
  e.holders.sort((a, b) => b[1] - a[1]);
  out[cusip] = {
    name: issuerName.get(cusip) ?? null,
    shares: e.shares,
    filers: e.filers,
    top: e.holders.slice(0, TOP_HOLDERS).map(([cik, shares]) => ({
      name: (managerName.get(cik) ?? cik).slice(0, 44),
      shares,
    })),
  };
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  quarter,
  source: url,
  issuers: kept,
  managers: byCik.size,
  note:
    "Form 13F institutional positions, deduplicated by filer CIK with RESTATEMENT and NEW HOLDINGS amendments resolved. Options and share-equivalents excluded. 13F covers institutional managers only — insider and retail holdings are not in this data.",
  data: out,
};

mkdirSync(resolve(ROOT, "data"), { recursive: true });
writeFileSync(resolve(ROOT, "data/institutional-ownership.json"), JSON.stringify(snapshot), "utf8");
try { unlinkSync(TMP); } catch {}

const bytes = statSync(resolve(ROOT, "data/institutional-ownership.json")).size;
console.log(`\nWrote data/institutional-ownership.json`);
console.log(`  ${kept.toLocaleString()} issuers (>= ${MIN_FILERS} filers) · ${(bytes / 1e6).toFixed(1)}MB`);
const aapl = out["037833100"];
if (aapl) console.log(`  sanity — AAPL: ${(aapl.shares / 1e9).toFixed(2)}B shares across ${aapl.filers.toLocaleString()} filers, top: ${aapl.top[0]?.name}`);
