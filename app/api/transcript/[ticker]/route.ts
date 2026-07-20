import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_KEY!;

async function get(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("apikey", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 21600 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

// GET /api/transcript/AAPL            → { dates: [{quarter, fiscalYear, date}] }
// GET /api/transcript/AAPL?year=2026&quarter=2 → { transcript: {...} }
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const year = req.nextUrl.searchParams.get("year");
  const quarter = req.nextUrl.searchParams.get("quarter");

  try {
    if (year && quarter) {
      const data = await get("/earning-call-transcript", { symbol: t, year, quarter });
      const row = Array.isArray(data) ? data[0] ?? null : null;
      if (!row?.content) {
        return NextResponse.json({ error: "Transcript not available" }, { status: 404 });
      }
      return NextResponse.json({
        transcript: {
          symbol: row.symbol,
          period: row.period,
          year: row.year,
          date: row.date,
          content: row.content,
        },
      });
    }

    const dates = await get("/earning-call-transcript-dates", { symbol: t });
    const list = (Array.isArray(dates) ? dates : [])
      .filter((d: any) => d.quarter && d.fiscalYear)
      .slice(0, 8)
      .map((d: any) => ({ quarter: d.quarter, fiscalYear: d.fiscalYear, date: d.date ?? null }));
    return NextResponse.json({ dates: list });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch transcript data" }, { status: 500 });
  }
}
