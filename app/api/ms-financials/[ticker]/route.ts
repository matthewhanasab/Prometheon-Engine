import { NextRequest, NextResponse } from "next/server";
import { fetchFacts, deriveStatements, resolveCik } from "@/lib/edgarFacts";

// Financial statements for the Market Stack edition, straight from SEC EDGAR
// XBRL. marketstack's own Statements endpoints are on the Business plan's
// feature list but return "route not found", so this reads the filings source
// the SEC publishes directly — free, public domain, no redistribution limit.
const MS = "https://api.marketstack.com/v2";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const period = req.nextUrl.searchParams.get("period") === "quarterly" ? "quarterly" : "annual";

  const cik = await resolveCik(t);
  if (!cik) return NextResponse.json({ error: `No SEC filer found for ${t}` }, { status: 404 });

  const facts = await fetchFacts(cik);
  if (!facts) return NextResponse.json({ error: `No XBRL filings for ${t}` }, { status: 404 });

  let statements;
  try {
    statements = deriveStatements(facts, period as "annual" | "quarterly");
  } catch (e: any) {
    return NextResponse.json({ error: `Could not derive statements: ${e?.message ?? e}` }, { status: 500 });
  }
  if (!statements.periods.length) {
    return NextResponse.json({ error: `No statement data on file for ${t}` }, { status: 404 });
  }

  // Company name only — everything numeric comes from EDGAR.
  let name = t;
  const key = process.env.MARKETSTACK_KEY;
  if (key) {
    try {
      const res = await fetch(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`, {
        next: { revalidate: 86400 },
      });
      const j = await res.json();
      const info = Array.isArray(j?.data) ? j.data[0] : j?.data;
      if (typeof info?.name === "string") name = info.name.replace(/&amp;/g, "&");
    } catch { /* name is cosmetic — fall back to the ticker */ }
  }

  return NextResponse.json({ ticker: t, name, period, cik, ...statements });
}
