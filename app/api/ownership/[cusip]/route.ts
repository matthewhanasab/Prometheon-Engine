import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import snapshot from "@/data/institutional-ownership.json";

// Institutional ownership for one issuer, looked up by CUSIP.
//
// Deliberately its own route. The snapshot is ~6.5MB and gets bundled into
// whichever function imports it, and /api/marketstack-stock is the hot path —
// there is no reason to grow it for a panel that loads after the page paints.
//
// Keyed by CUSIP rather than ticker because 13F identifies securities by CUSIP
// and nothing in the filings carries a symbol. The research page already has
// the ISIN from marketstack, and a US ISIN is "US" + CUSIP + a check digit, so
// the mapping costs nothing.
//
// Built by scripts/build-institutional-ownership.mjs — see that file for why
// filer identity, amendment type and duplicate filings all have to be handled
// before these numbers mean anything.
type Holder = { name: string; shares: number };
type Record_ = { name: string | null; shares: number; filers: number; top: Holder[] };

const DATA = snapshot.data as unknown as Record<string, Record_>;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cusip: string }> }
) {
  const limited = guard(req, 8);
  if (limited) return limited;

  const { cusip } = await params;
  const key = cusip.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
  if (key.length !== 9) {
    return NextResponse.json({ error: "A 9-character CUSIP is required" }, { status: 400 });
  }

  const rec = DATA[key];
  if (!rec) {
    // Not an error: a security no institution reports, or one below the filer
    // floor the snapshot keeps, genuinely has no 13F picture.
    return NextResponse.json(
      {
        cusip: key,
        found: false,
        quarter: snapshot.quarter,
        reason: "No 13F positions reported for this security in the latest quarter",
      },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" } }
    );
  }

  return NextResponse.json(
    {
      cusip: key,
      found: true,
      quarter: snapshot.quarter,
      generatedAt: snapshot.generatedAt,
      issuerName: rec.name,
      shares: rec.shares,
      filers: rec.filers,
      top: rec.top,
      note: snapshot.note,
    },
    {
      // Filings land once a quarter and never change once filed, so this is as
      // static as data gets.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
    }
  );
}
