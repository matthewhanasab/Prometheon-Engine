import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { msGet } from "@/lib/marketstack";

// Intraday price bars for the research chart's 1D and 5D views.
//
// Bars are five minutes apart for a single session and thirty minutes for a
// week, grouped by New York trading day so a request made in the evening
// still shows the session that just closed rather than an empty "today".
const MS = "https://api.marketstack.com/v2";

const nyDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 2);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });
  if (!key) return NextResponse.json({ error: "Price data not configured" }, { status: 500 });

  const range = req.nextUrl.searchParams.get("range") === "5D" ? "5D" : "1D";
  const days = range === "5D" ? 5 : 1;
  const interval = range === "5D" ? "30min" : "5min";
  // Enough bars to cover the window even across a holiday weekend.
  const limit = range === "5D" ? 200 : 300;

  const res = await msGet(
    `${MS}/intraday?access_key=${key}&symbols=${t}&interval=${interval}&sort=DESC&limit=${limit}`,
    300
  );
  const rows: Record<string, unknown>[] = Array.isArray(res.data?.data) ? res.data.data : [];
  if (!rows.length) {
    return NextResponse.json(
      { ticker: t, range, points: [], error: res.err ?? "No intraday data" },
      { status: res.err ? 502 : 200, headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }
    );
  }

  const byDay = new Map<string, { date: string; price: number }[]>();
  for (const r of rows) {
    const price = Number(r.last ?? r.marketstack_last ?? r.close);
    if (!(price > 0) || !r.date) continue;
    const day = nyDay(String(r.date));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({ date: new Date(String(r.date)).toISOString(), price });
  }
  const keep = [...byDay.keys()].sort().slice(-days);
  const points = keep
    .flatMap((d) => byDay.get(d)!)
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    { ticker: t, range, interval, points },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900" } }
  );
}
