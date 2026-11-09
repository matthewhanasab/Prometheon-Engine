import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { getInsiderTrades, getSecFilings } from "@/lib/sec";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 4);
  if (limited) return limited;
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!t) return NextResponse.json({ filings: [], insiders: [] });
  try {
    const [filings, insiders] = await Promise.all([
      getSecFilings(t),
      getInsiderTrades(t),
    ]);
    // Every listed company has filings, so nothing at all means EDGAR turned
    // the lookup away (it throttles bursts). That answer must not be kept:
    // cached, it left Apple's page reading "No filings found" for a day.
    const empty = filings.length === 0 && insiders.length === 0;
    return NextResponse.json({ filings, insiders }, {
      headers: { "Cache-Control": empty ? "no-store" : "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch SEC data" }, { status: 500 });
  }
}
