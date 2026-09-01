// Revenue disaggregated by product and geography, from a filing's own XBRL.
//
// The charts page said this wasn't obtainable, and from companyfacts it isn't:
// that API returns only consolidated values, with every dimensional fact
// dropped. But the dimensions do exist — in the XBRL instance document attached
// to the 10-K itself, where each fact points at a context carrying the axis and
// member it belongs to. Apple's instance yields iPhone $209.6B, Services
// $109.2B, Wearables $35.7B, Mac $33.7B and iPad $28.0B for FY2025, which are
// its reported figures.
//
// The cost is that instances are whole filings: ~1.4MB for Apple, 4MB for
// Coca-Cola, 15MB for JPMorgan. Too heavy to precompute across every issuer and
// too heavy to block a page on, so this is fetched per ticker, cached hard, and
// loaded after the page paints.
//
// Parsed with regex rather than a DOM. A 15MB instance is a lot to materialise,
// only two node types matter (contexts and revenue facts), and the shapes are
// rigid — the XBRL 2.1 spec fixes them, and these files are machine-generated.

const SEC_UA = "Prometheon Engine (matthanasab@gmail.com)";

export type SegmentSlice = { label: string; value: number };
export type SegmentBreakdown = {
  axis: "product" | "geography" | "segment";
  periodEnd: string;
  periodDays: number;
  slices: SegmentSlice[];
  /** Share of consolidated revenue these slices account for, 0-1. */
  coverage: number | null;
};
export type Segments = {
  ticker: string;
  cik: string;
  filed: string | null;
  accession: string | null;
  product: SegmentBreakdown | null;
  geography: SegmentBreakdown | null;
  segment: SegmentBreakdown | null;
};

// Revenue concepts, matched without their namespace prefix.
const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "RevenueFromContractWithCustomerIncludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
];

const AXIS_KIND: Record<string, SegmentBreakdown["axis"]> = {
  ProductOrServiceAxis: "product",
  StatementGeographicalAxis: "geography",
  StatementBusinessSegmentsAxis: "segment",
};

// ISO 3166 alpha-2 members appear as bare country codes rather than
// ...Member names, so the common ones are spelled out.
const COUNTRY: Record<string, string> = {
  US: "United States", CN: "China", JP: "Japan", GB: "United Kingdom",
  DE: "Germany", FR: "France", CA: "Canada", MX: "Mexico", IN: "India",
  BR: "Brazil", KR: "South Korea", TW: "Taiwan", AU: "Australia", IE: "Ireland",
  NL: "Netherlands", CH: "Switzerland", SG: "Singapore", IT: "Italy", ES: "Spain",
};

/** "IPhoneMember" -> "iPhone"; "US" -> "United States". */
export function prettyMember(raw: string): string {
  let s = raw.includes(":") ? raw.split(":").pop()! : raw;
  if (COUNTRY[s]) return COUNTRY[s];
  s = s.replace(/Member$/, "");
  if (!s) return raw;
  s = s
    // "WearablesHomeandAccessories": the conjunction is lowercase and glued to
    // the word before it, so camel-splitting alone yields "Homeand".
    .replace(/([a-z])and([A-Z])/g, "$1 and $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bUs\b/g, "US")
    .replace(/\bLinked In\b/g, "LinkedIn")
    .replace(/\bNon US\b/g, "Non-US")
    .replace(/\s+/g, " ")
    .trim();
  // Apple tags iPhone/iPad as IPhone/IPad; restore the lowercase-i product names.
  s = s.replace(/^I(Phone|Pad|Pod|Mac|Cloud|OS)\b/, (_m, w) => `i${w}`);
  return s;
}

type Ctx = { dims: Record<string, string>; start: string | null; end: string | null };

function parseContexts(xml: string): Map<string, Ctx> {
  const out = new Map<string, Ctx>();
  const re = /<(?:[\w.-]+:)?context[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g;
  for (const m of xml.matchAll(re)) {
    const body = m[2];
    const dims: Record<string, string> = {};
    for (const d of body.matchAll(
      /<(?:[\w.-]+:)?explicitMember[^>]*dimension="([^"]+)"[^>]*>([^<]+)</g
    )) {
      dims[d[1].split(":").pop()!] = d[2].trim();
    }
    const start = /<(?:[\w.-]+:)?startDate>([^<]+)</.exec(body)?.[1] ?? null;
    const end =
      /<(?:[\w.-]+:)?endDate>([^<]+)</.exec(body)?.[1] ??
      /<(?:[\w.-]+:)?instant>([^<]+)</.exec(body)?.[1] ??
      null;
    out.set(m[1], { dims, start, end });
  }
  return out;
}

const dayspan = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/**
 * Collapse one axis into a breakdown for the most recent annual period.
 *
 * Two things have to be handled or the chart lies:
 *
 *   - Aggregate members sit on the same axis as their children. Apple tags
 *     ProductMember at $307.0B alongside iPhone, Mac, iPad and Wearables, which
 *     sum to exactly that. Plotting both double-counts and dwarfs the parts, so
 *     a member matching the sum of the others is dropped as the total row.
 *   - The same member can be tagged more than once for one period (different
 *     consolidation contexts). Values are keyed by member, not appended.
 */
function buildBreakdown(
  axis: SegmentBreakdown["axis"],
  facts: { member: string; start: string; end: string; val: number }[],
  consolidated: Map<string, number>
): SegmentBreakdown | null {
  const annual = facts.filter((f) => {
    const d = dayspan(f.start, f.end);
    return d > 330 && d < 400;
  });
  if (!annual.length) return null;

  const periodEnd = annual.reduce((a, b) => (a > b.end ? a : b.end), "");
  const inPeriod = annual.filter((f) => f.end === periodEnd);
  if (!inPeriod.length) return null;

  const byMember = new Map<string, number>();
  for (const f of inPeriod) {
    const label = prettyMember(f.member);
    // Same member, same period: keep the larger figure rather than summing,
    // since repeats are the same number tagged in two contexts.
    byMember.set(label, Math.max(byMember.get(label) ?? 0, f.val));
  }

  let slices = [...byMember.entries()]
    .map(([label, value]) => ({ label, value }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);
  if (slices.length < 2) return null;

  // Drop aggregate rows.
  //
  // A parent sits on the same axis as its children but need not cover all of
  // them: Apple tags ProductMember at $307.0B, which is iPhone + Mac + iPad +
  // Wearables — while Services, at $109.2B, is a sibling of the parent rather
  // than one of its children. Comparing a member against the sum of every other
  // member therefore misses it, and the chart double-counts $307B.
  //
  // So a member is an aggregate if ANY subset of the others sums to it. Segment
  // lists are short (rarely past eight members), which makes the exhaustive
  // check cheap and exact where a heuristic would be neither.
  const isAggregate = (idx: number, arr: SegmentSlice[]): boolean => {
    const target = arr[idx].value;
    const others = arr.filter((_, i) => i !== idx).map((x) => x.value);
    if (others.length < 2 || others.length > 20) return false;
    const tol = target * 0.01;
    const seen = new Set<number>([0]);
    for (const v of others) {
      for (const partial of [...seen]) {
        const sum = partial + v;
        if (sum > target + tol) continue;
        if (Math.abs(sum - target) <= tol) return true;
        seen.add(sum);
      }
    }
    return false;
  };
  const trimmed = slices.filter((_, i) => !isAggregate(i, slices));
  if (trimmed.length >= 2) slices = trimmed;
  if (slices.length < 2) return null;

  // How much of the company this breakdown actually explains.
  //
  // A disaggregation need not be exhaustive. Apple's product rows sum to its
  // full $416.2B, but Microsoft names only $91.2B of products against $331.8B
  // of revenue — the rest sits in lines it doesn't break out. Charting that as
  // "revenue by product" would imply Microsoft is a quarter the size it is, so
  // the share covered travels with the data and the page can say so.
  const sliceTotal = slices.reduce((s, x) => s + x.value, 0);
  const whole = consolidated.get(periodEnd) ?? null;
  const coverage = whole && whole > 0 ? sliceTotal / whole : null;

  const span = inPeriod[0];
  return { axis, periodEnd, periodDays: dayspan(span.start, span.end), slices, coverage };
}

async function sec(url: string, revalidate: number): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEC_UA, Accept: "application/json, */*" },
      next: { revalidate },
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** Locate the XBRL instance document of the newest annual report. */
async function latestAnnualInstance(cik: string) {
  const res = await sec(`https://data.sec.gov/submissions/CIK${cik.padStart(10, "0")}.json`, 43200);
  if (!res) return null;
  const json = await res.json();
  const rec = json?.filings?.recent;
  if (!rec?.form) return null;
  for (let i = 0; i < rec.form.length; i++) {
    if (rec.form[i] !== "10-K" && rec.form[i] !== "20-F") continue;
    const accession: string = rec.accessionNumber[i];
    const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession.replace(/-/g, "")}`;
    const idx = await sec(`${base}/index.json`, 86400);
    if (!idx) continue;
    const items = (await idx.json())?.directory?.item ?? [];
    // The instance is the *_htm.xml sibling of the primary document.
    const inst = items.find((f: { name: string }) => /_htm\.xml$/.test(f.name));
    if (!inst) continue;
    return { url: `${base}/${inst.name}`, filed: rec.filingDate[i] as string, accession };
  }
  return null;
}

export async function fetchSegments(ticker: string, cik: string): Promise<Segments | null> {
  const found = await latestAnnualInstance(cik);
  if (!found) return null;

  const res = await sec(found.url, 86400);
  if (!res) return null;
  const xml = await res.text();

  const contexts = parseContexts(xml);
  const collected: Record<string, { member: string; start: string; end: string; val: number }[]> = {
    product: [], geography: [], segment: [],
  };
  // Dimensionless revenue facts are the consolidated top line, used as the
  // denominator for coverage.
  const consolidated = new Map<string, number>();

  const tagAlt = REVENUE_TAGS.join("|");
  const factRe = new RegExp(
    `<(?:[\\w.-]+:)?(${tagAlt})\\b[^>]*\\scontextRef="([^"]+)"[^>]*>([^<]+)<`,
    "g"
  );
  for (const m of xml.matchAll(factRe)) {
    const ctx = contexts.get(m[2]);
    if (!ctx || !ctx.start || !ctx.end) continue;
    const val = Number(String(m[3]).replace(/,/g, ""));
    if (!Number.isFinite(val)) continue;
    if (Object.keys(ctx.dims).length === 0) {
      const d = dayspan(ctx.start, ctx.end);
      if (d > 330 && d < 400) {
        consolidated.set(ctx.end, Math.max(consolidated.get(ctx.end) ?? 0, val));
      }
      continue;
    }
    for (const [axis, member] of Object.entries(ctx.dims)) {
      const kind = AXIS_KIND[axis];
      // Only single-axis facts: a fact carrying both a product and a geography
      // is a cell of a cross-tab, not a row of either breakdown.
      if (!kind || Object.keys(ctx.dims).length !== 1) continue;
      collected[kind].push({ member, start: ctx.start, end: ctx.end, val });
    }
  }

  const product = buildBreakdown("product", collected.product, consolidated);
  const geography = buildBreakdown("geography", collected.geography, consolidated);
  const segment = buildBreakdown("segment", collected.segment, consolidated);
  if (!product && !geography && !segment) return null;

  return {
    ticker: ticker.toUpperCase(),
    cik,
    filed: found.filed,
    accession: found.accession,
    product,
    geography,
    segment,
  };
}
