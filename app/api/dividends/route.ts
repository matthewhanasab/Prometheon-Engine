import { NextRequest, NextResponse } from "next/server";

const FMP_BASE = "https://financialmodelingprep.com/stable";

async function fetchJson(url: string, revalidate: number): Promise<any[]> {
  try {
    const res = await fetch(url, { next: { revalidate } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const key = process.env.FMP_KEY ?? "";
  const sp = req.nextUrl.searchParams;
  const ticker = sp.get("ticker");
  const from = sp.get("from");
  const to = sp.get("to");

  try {
    if (ticker) {
      const sym = ticker.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
      const history = await fetchJson(
        `${FMP_BASE}/dividends?symbol=${sym}&limit=40&apikey=${key}`,
        21600
      );
      return NextResponse.json({ history });
    }

    const dateOk = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (dateOk(from) && dateOk(to)) {
      const calendar = await fetchJson(
        `${FMP_BASE}/dividends-calendar?from=${from}&to=${to}&apikey=${key}`,
        21600
      );
      return NextResponse.json({ calendar });
    }

    return NextResponse.json({ error: "Provide ?ticker= or ?from=&to=" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch dividend data" }, { status: 500 });
  }
}
