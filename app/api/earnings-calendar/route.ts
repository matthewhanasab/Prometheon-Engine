import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import calendar from "@/data/earnings-calendar.json";

// Upcoming earnings calendar, served from a precomputed snapshot.
//
// The dates come from SEC EDGAR: every US filer announces quarterly results in
// an 8-K tagged item 2.02, so those filing dates are the company's real
// announcement history, and the next one is projected from that cadence
// (anchored to the same fiscal quarter a year earlier, then snapped to the
// weekday the company habitually reports on).
//
// That scan needs one SEC request per company against a ~10 req/s ceiling —
// 1–4 minutes for the S&P 1500. Doing it per-request meant a page that sat on
// loading skeletons and never filled, since no single serverless invocation
// could finish and separate instances couldn't share progress. The projections
// only move when a company reschedules, so the scan runs offline
// (scripts/build-earnings-calendar.mjs) and this route just serves the result.
export async function GET(req: NextRequest) {
  const limited = guard(req, 2);
  if (limited) return limited;

  const all = req.nextUrl.searchParams.get("universe") === "all";
  const entries = all ? calendar.entries : calendar.entries.filter((e) => e.sp500);

  return NextResponse.json(
    {
      universe: all ? "all" : "sp500",
      generatedAt: calendar.generatedAt,
      count: entries.length,
      entries,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
