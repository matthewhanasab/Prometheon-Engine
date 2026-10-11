import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import { fetchConsensusEps } from "@/lib/analystEstimates";

// Analyst consensus EPS on its own — nothing else.
//
// The compare page used /api/stock-analysts for these rows, but that route
// also makes the analyst-ratings call, which is the slowest call in the stack
// and gets rate-limited when three tickers ask at once. When it ran long
// enough to time out, the fast consensus numbers were thrown away with it and
// every "consensus" row read N/A. This route has no ratings call and no price
// lookup; the caller already has the price and computes the multiple itself.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const limited = guard(req, 2);
  if (limited) return limited;

  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  if (!t) return NextResponse.json({ error: "Ticker required" }, { status: 400 });

  const consensus = await fetchConsensusEps(t).catch(() => null);
  return NextResponse.json(
    { ticker: t, consensus },
    {
      headers: {
        "Cache-Control": consensus
          ? "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
          : "public, max-age=0, s-maxage=60",
      },
    }
  );
}
