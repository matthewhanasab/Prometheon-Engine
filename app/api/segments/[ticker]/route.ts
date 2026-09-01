import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { resolveCik } from "@/lib/edgarFacts";
import { fetchSegments } from "@/lib/segments";

// Revenue split by product, geography and reportable segment.
//
// The charts page carried a note saying this couldn't be had, because the
// companyfacts API returns consolidated values only and drops every dimensional
// fact. It's in the filing itself though — see lib/segments.ts — so this reads
// the 10-K's own XBRL instance instead.
//
// Its own route rather than part of the charts payload: instances run from
// ~1.4MB (Apple) to ~15MB (JPMorgan), and nothing else on the page should wait
// on that. The page loads this after it paints, and the result is cached for a
// day — an annual filing lands once a year.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 6);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });

  const cik = await resolveCik(t);
  if (!cik) {
    return NextResponse.json(
      { ticker: t, found: false, reason: "No SEC registrant found for this ticker" },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400" } }
    );
  }

  let segments = null;
  try {
    segments = await fetchSegments(t, cik);
  } catch {
    segments = null;
  }

  if (!segments) {
    return NextResponse.json(
      {
        ticker: t,
        found: false,
        // Plenty of filers disclose no disaggregation at all — a single-product
        // company has nothing to split — so this is an answer, not a failure.
        reason: "This filer's latest annual report discloses no revenue disaggregation",
      },
      // Short window: a parse that came back empty because the fetch was slow
      // shouldn't be frozen in for a day.
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=900" } }
    );
  }

  return NextResponse.json(
    { found: true, ...segments },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
