import { NextRequest, NextResponse } from "next/server";

const MS_BASE = "https://api.marketstack.com/v2";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const msKey = process.env.MARKETSTACK_KEY;

  if (!msKey) {
    return NextResponse.json({ error: "Marketstack key not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `${MS_BASE}/eod?access_key=${msKey}&symbols=${encodeURIComponent(t)}&limit=120`,
      { next: { revalidate: 86400 } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: `Marketstack API error: ${res.status}` }, { status: 400 });
    }

    const raw = await res.json();

    if (!Array.isArray(raw.data) || raw.data.length === 0) {
      return NextResponse.json({ error: "Ticker not found or no data available" }, { status: 404 });
    }

    const rows = raw.data.filter((r: any) => r && typeof r === "object");
    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid data rows" }, { status: 404 });
    }

    const latest = rows[0];
    const oldest = rows[rows.length - 1];

    // Count corporate actions
    const dividendCount = rows.filter((r: any) => (r.dividend ?? 0) > 0).length;
    const splitCount = rows.filter((r: any) => (r.split_factor ?? 1) !== 1).length;

    // Format for display (most recent 20)
    const displayRows = rows.slice(0, 20).map((r: any) => ({
      date: String(r.date ?? "").slice(0, 10),
      close: r.close ?? 0,
      volume: r.volume ?? 0,
      dividend: r.dividend ?? 0,
      split: r.split_factor ?? 1,
    }));

    return NextResponse.json({
      ticker: t,
      name: latest.name ?? t,
      exchange: latest.exchange_code ?? latest.exchange ?? "—",
      assetType: latest.asset_type ?? "Stock",
      latestClose: latest.close ?? 0,
      latestDate: String(latest.date ?? "").slice(0, 10),
      oldestDate: String(oldest.date ?? "").slice(0, 10),
      rowCount: rows.length,
      dividendCount,
      splitCount,
      rows: displayRows,
      tier: "Professional ($49.99/mo) or Business ($149.99/mo)",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to fetch: ${e?.message ?? e}` },
      { status: 500 }
    );
  }
}
