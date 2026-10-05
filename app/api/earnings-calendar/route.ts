import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { fetchEarningsDay, tickerKey, type CalendarEntry } from "@/lib/earningsCalendar";
import projections from "@/data/earnings-calendar.json";
import sp500List from "@/data/sp500.json";

// Earnings calendar, one trading week per request: ?week=YYYY-MM-DD (any day in
// the week; it is snapped to that week's Monday).
//
// Near weeks are the exchange's scheduled dates (see lib/earningsCalendar.ts).
// Weeks past that feed's ~7-week horizon fall back to the precomputed
// filing-cadence projections in data/earnings-calendar.json, flagged
// `source: "projected"` so the page can say the dates are estimates.
const SP500 = new Set(sp500List.tickers.map(tickerKey));

const DAY_MS = 86400000;

function mondayOf(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const limited = guard(req, 3);
  if (limited) return limited;

  const today = new Date().toISOString().slice(0, 10);
  const monday = mondayOf(req.nextUrl.searchParams.get("week") ?? today);
  // Bounded so the week parameter can't be used to mint unlimited cache keys.
  const offset = monday ? (Date.parse(monday) - Date.parse(today)) / DAY_MS : NaN;
  if (!monday || !(offset > -800 && offset < 400)) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const days = Array.from({ length: 5 }, (_, i) =>
    new Date(Date.parse(monday) + i * DAY_MS).toISOString().slice(0, 10));

  const perDay = await Promise.all(days.map((d) => fetchEarningsDay(d, SP500)));
  const failedDays = perDay.filter((d) => d === null).length;
  const scheduled = perDay.flatMap((d) => d ?? []);

  let entries: CalendarEntry[] = scheduled;
  let source: "scheduled" | "projected" = "scheduled";

  // Nothing scheduled for the whole week: either it is beyond the feed's
  // horizon or every request failed. The projections cover both.
  if (!scheduled.length) {
    const projected = projections.entries
      .filter((e) => e.next >= days[0] && e.next <= days[4])
      .map((e): CalendarEntry => ({
        ticker: e.ticker, name: e.name, date: e.next, time: null,
        epsEstimate: null, estimates: null, epsActual: null, surprisePct: null,
        marketCap: null, sp500: SP500.has(tickerKey(e.ticker)),
      }));
    if (projected.length) {
      entries = projected;
      source = "projected";
    }
  }

  // A week with missing days is served, but only briefly cached, so one bad
  // upstream moment doesn't pin a half-empty calendar for half an hour.
  const degraded = failedDays > 0;
  return NextResponse.json(
    { week: monday, source, degraded, count: entries.length, entries },
    {
      headers: {
        "Cache-Control": degraded
          ? "public, max-age=0, s-maxage=30"
          : "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400",
      },
    }
  );
}
