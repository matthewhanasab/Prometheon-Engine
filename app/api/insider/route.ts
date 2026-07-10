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

// "PELOSI NANCY P" -> "Pelosi Nancy P"
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// "officer: Chief Financial Officer" -> "Chief Financial Officer"
// "director" -> "Director"
function prettyRole(s: string | null | undefined): string | null {
  if (!s) return null;
  const idx = s.indexOf(":");
  const part = (idx >= 0 ? s.slice(idx + 1) : s).trim();
  if (!part) return null;
  return part.charAt(0).toUpperCase() + part.slice(1);
}

export async function GET(req: NextRequest) {
  const key = process.env.FMP_KEY ?? "";
  const symbol = req.nextUrl.searchParams.get("symbol");

  try {
    let rows: any[] = [];
    if (symbol) {
      const sym = symbol.trim().toUpperCase();
      rows = await fetchJson(`${FMP_BASE}/insider-trading/search?symbol=${sym}&limit=100&apikey=${key}`, 3600);
    } else {
      rows = await fetchJson(`${FMP_BASE}/insider-trading/latest?page=0&limit=100&apikey=${key}`, 3600);
    }

    const trades = rows.map((r) => {
      const shares = typeof r.securitiesTransacted === "number" ? r.securitiesTransacted : null;
      const price = typeof r.price === "number" ? r.price : null;
      const value = price && shares ? price * shares : null;
      return {
        symbol: r.symbol ?? null,
        filingDate: r.filingDate ?? null,
        transactionDate: r.transactionDate ?? null,
        insider: r.reportingName ? titleCase(String(r.reportingName)) : null,
        role: prettyRole(r.typeOfOwner),
        type: r.transactionType ?? null,
        ad: r.acquisitionOrDisposition ?? null,
        shares,
        price,
        value,
        security: r.securityName ?? null,
        formType: r.formType ?? null,
        url: r.url ?? null,
      };
    });

    return NextResponse.json({ trades });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch insider trades" }, { status: 500 });
  }
}
