import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import snapshot from "@/data/congress-trades.json";

// Congressional stock trades, served from a precomputed snapshot.
//
// The STOCK Act requires members of both chambers to file a Periodic
// Transaction Report within 45 days of a trade, so the underlying data is
// public — but neither chamber publishes it as data:
//
//   House  — a yearly ZIP with an XML index of filings; each Periodic
//            Transaction Report is a separate PDF, and those PDFs are
//            encrypted (128-bit RC4, empty password, set for permissions).
//            Decrypted, they hold a full text layer.
//   Senate — a terms-gated portal; once the session is established, electronic
//            reports are HTML tables carrying an explicit ticker column.
//
// Assembling either means hundreds of round trips against government hosts, so
// the scan runs offline (scripts/build-congress-trades.mjs) and this route just
// serves the result. Filings never change once submitted, so the snapshot only
// goes stale as new ones arrive — hence the long CDN window.
export async function GET(req: NextRequest) {
  const limited = guard(req, 2);
  if (limited) return limited;

  const p = req.nextUrl.searchParams;
  const ticker = p.get("ticker")?.trim().toUpperCase();
  const chamber = p.get("chamber")?.trim().toLowerCase();
  const member = p.get("member")?.trim().toLowerCase();
  const side = p.get("side")?.trim().toLowerCase();
  // Free-text box on the page: one field that means either a ticker or a name.
  const q = p.get("q")?.trim().toLowerCase();
  const limit = Math.min(Number(p.get("limit")) || 250, 2000);

  let trades = snapshot.trades;
  if (ticker) trades = trades.filter((t) => t.ticker === ticker);
  if (chamber === "house" || chamber === "senate") trades = trades.filter((t) => t.chamber === chamber);
  if (member) trades = trades.filter((t) => t.member.toLowerCase().includes(member));
  if (q) trades = trades.filter((t) => t.ticker.toLowerCase().includes(q) || t.member.toLowerCase().includes(q));
  if (side === "buys") trades = trades.filter((t) => t.action === "purchase");
  if (side === "sells") trades = trades.filter((t) => t.action === "sale" || t.action === "sale_partial");

  // Totals describe the whole matching set, not just the page being returned,
  // so the summary can't quietly report the cap as if it were the real count.
  const total = trades.length;
  const purchases = trades.filter((t) => t.action === "purchase");
  const sales = trades.filter((t) => t.action === "sale" || t.action === "sale_partial");
  const mid = (a: { low: number | null; high: number | null }) =>
    a.low == null ? 0 : a.high == null ? a.low : (a.low + a.high) / 2;
  const totals = {
    purchases: purchases.length,
    sales: sales.length,
    purchaseVolume: purchases.reduce((s, t) => s + mid(t.amount), 0),
    saleVolume: sales.reduce((s, t) => s + mid(t.amount), 0),
    members: new Set(trades.map((t) => t.member)).size,
  };
  const topTickers = [...trades.reduce((m, t) => m.set(t.ticker, (m.get(t.ticker) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return NextResponse.json(
    {
      generatedAt: snapshot.generatedAt,
      years: snapshot.years,
      total,
      count: Math.min(total, limit),
      totals,
      topTickers,
      coverage: snapshot.coverage,
      trades: trades.slice(0, limit),
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" } }
  );
}
