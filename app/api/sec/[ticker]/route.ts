import { NextRequest, NextResponse } from "next/server";
import { getInsiderTrades, getSecFilings } from "@/lib/sec";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  try {
    const [filings, insiders] = await Promise.all([
      getSecFilings(ticker),
      getInsiderTrades(ticker),
    ]);
    return NextResponse.json({ filings, insiders });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch SEC data" }, { status: 500 });
  }
}
