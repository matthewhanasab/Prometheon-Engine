import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { msGet } from "@/lib/marketstack";

// Market overview: the major index levels and government 10-year yields.
//
// The macro page used to stand in for the indices with ETF proxies (SPY for
// the S&P 500, QQQ for the Nasdaq) because the index feed wasn't wired up.
// The Business plan carries the indices themselves — level, day move, and
// week/month/year performance — and sovereign bond yields, so this serves
// both from one place for the macro and movers pages.
const MS = "https://api.marketstack.com/v2";

// Benchmark codes differ by provider, so each index lists the spellings it
// might go by; the first one present in the feed's own list wins.
const INDICES: { label: string; codes: string[] }[] = [
  { label: "S&P 500",        codes: ["us500"] },
  { label: "Dow Jones",      codes: ["us30"] },
  { label: "Nasdaq 100",     codes: ["us100"] },
  { label: "Russell 1000",   codes: ["us1000"] },
  { label: "FTSE 100",       codes: ["gb100", "uk100"] },
  { label: "DAX",            codes: ["de40"] },
  { label: "Euro Stoxx 50",  codes: ["eu50"] },
  { label: "Nikkei 225",     codes: ["jp225"] },
];

const BONDS: { label: string; country: string }[] = [
  { label: "United States", country: "united states" },
  { label: "Germany",       country: "germany" },
  { label: "United Kingdom", country: "united kingdom" },
  { label: "Japan",         country: "japan" },
  { label: "Canada",        country: "canada" },
  { label: "Italy",         country: "italy" },
];

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[%,+\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export type IndexQuote = {
  code: string; label: string; price: number;
  changeDay: number | null; pctDay: number | null;
  pctWeek: number | null; pctMonth: number | null; pctYear: number | null;
  date: string | null;
};
export type BondQuote = {
  label: string; country: string; tenor: string; yieldPct: number;
  changeDay: number | null; pctWeek: number | null; pctMonth: number | null; pctYear: number | null;
  date: string | null;
};

export async function GET(req: NextRequest) {
  const limited = guard(req, 2);
  if (limited) return limited;
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return NextResponse.json({ indices: [], bonds: [], asOf: new Date().toISOString() });

  // The feed's own benchmark list, refreshed daily, decides which spelling
  // each index goes by.
  const listRes = await msGet(`${MS}/indexlist?access_key=${key}&limit=1000`, 86400);
  const listRows: Record<string, unknown>[] = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
  const available = new Set(listRows.map((r) => String(r?.benchmark ?? "").toLowerCase()).filter(Boolean));
  if (req.nextUrl.searchParams.get("list") === "1") {
    return NextResponse.json({ count: available.size, benchmarks: [...available].sort(), error: listRes.err });
  }

  const picks = INDICES.map((ix) => ({
    ...ix,
    code: ix.codes.find((c) => available.has(c)) ?? (available.size ? null : ix.codes[0]),
  })).filter((ix): ix is typeof ix & { code: string } => ix.code != null);

  // Three in flight at a time: fast enough to answer in a second or two,
  // slow enough to stay under the provider's per-second ceiling.
  const pooled = async <T,>(jobs: (() => Promise<T>)[], width = 3): Promise<T[]> => {
    const out: T[] = new Array(jobs.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, async () => {
      while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
    }));
    return out;
  };

  const indexRows = await pooled(picks.map((ix) => async (): Promise<IndexQuote | null> => {
    const r = await msGet(`${MS}/indexinfo?access_key=${key}&index=${encodeURIComponent(ix.code)}`, 300);
    // The index payload is a bare array, unlike every other endpoint.
    const rowsIx: Record<string, unknown>[] = Array.isArray(r.data) ? r.data
      : Array.isArray(r.data?.data) ? r.data.data : r.data?.data ? [r.data.data] : [];
    const row = rowsIx[0] ?? null;
    const price = num(row?.price);
    if (!row || price == null) return null;
    return {
      code: ix.code, label: ix.label, price,
      changeDay: num(row.price_change_day), pctDay: num(row.percentage_day),
      pctWeek: num(row.percentage_week), pctMonth: num(row.percentage_month), pctYear: num(row.percentage_year),
      date: row.date ? String(row.date) : null,
    };
  }));
  const indices = indexRows.filter((x): x is IndexQuote => x != null);

  const bondRows = await pooled(BONDS.map((b) => async (): Promise<BondQuote | null> => {
    const r = await msGet(`${MS}/bond?access_key=${key}&country=${encodeURIComponent(b.country)}`, 900);
    const rows: Record<string, unknown>[] = Array.isArray(r.data?.data) ? r.data.data : r.data?.data ? [r.data.data] : [];
    const row = rows.find((x) => /10/.test(String(x?.type ?? ""))) ?? rows[0];
    const y = num(row?.yield);
    if (!row || y == null) return null;
    return {
      label: b.label, country: b.country, tenor: String(row.type ?? "10Y"), yieldPct: y,
      changeDay: num(row.price_change_day), pctWeek: num(row.percentage_week),
      pctMonth: num(row.percentage_month), pctYear: num(row.percentage_year),
      date: row.date ? String(row.date) : null,
    };
  }));
  const bonds = bondRows.filter((x): x is BondQuote => x != null);

  const degraded = !indices.length && !bonds.length;
  return NextResponse.json(
    { indices, bonds, asOf: new Date().toISOString(), errors: degraded ? { list: listRes.err } : undefined },
    {
      headers: {
        "Cache-Control": degraded
          ? "public, max-age=0, s-maxage=60"
          : "public, max-age=0, s-maxage=300, stale-while-revalidate=1800",
      },
    }
  );
}
