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
  const ticker = req.nextUrl.searchParams.get("ticker");
  const name = req.nextUrl.searchParams.get("name");

  try {
    let senate: any[] = [];
    let house: any[] = [];

    if (name) {
      const q = encodeURIComponent(name.trim());
      [senate, house] = await Promise.all([
        fetchJson(`${FMP_BASE}/senate-trades-by-name?name=${q}&apikey=${key}`, 3600),
        fetchJson(`${FMP_BASE}/house-trades-by-name?name=${q}&apikey=${key}`, 3600),
      ]);
    } else if (ticker) {
      const sym = ticker.trim().toUpperCase();
      [senate, house] = await Promise.all([
        fetchJson(`${FMP_BASE}/senate-trades?symbol=${sym}&apikey=${key}`, 3600),
        fetchJson(`${FMP_BASE}/house-trades?symbol=${sym}&apikey=${key}`, 3600),
      ]);
    } else {
      [senate, house] = await Promise.all([
        fetchJson(`${FMP_BASE}/senate-latest?page=0&limit=100&apikey=${key}`, 3600),
        fetchJson(`${FMP_BASE}/house-latest?page=0&limit=100&apikey=${key}`, 3600),
      ]);
    }

    const tag = (rows: any[], chamber: "senate" | "house") =>
      rows.map((r) => ({
        chamber,
        symbol: r.symbol ?? null,
        disclosureDate: r.disclosureDate ?? null,
        transactionDate: r.transactionDate ?? null,
        firstName: r.firstName ?? "",
        lastName: r.lastName ?? "",
        office: r.office ?? null,
        district: r.district ?? null,
        owner: r.owner ?? null,
        assetDescription: r.assetDescription ?? null,
        assetType: r.assetType ?? null,
        type: r.type ?? null,
        amount: r.amount ?? null,
        comment: r.comment ?? null,
        link: r.link ?? null,
      }));

    const trades = [...tag(senate, "senate"), ...tag(house, "house")].sort(
      (a, b) => (b.disclosureDate ?? "").localeCompare(a.disclosureDate ?? "")
    );

    return NextResponse.json({ trades });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch congress trades" }, { status: 500 });
  }
}
