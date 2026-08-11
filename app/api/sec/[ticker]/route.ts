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
    return NextResponse.json({ filings, insiders });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch SEC data" }, { status: 500 });
  }
}
