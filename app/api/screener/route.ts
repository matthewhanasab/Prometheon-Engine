import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";

export async function GET(req: NextRequest) {
  const key = process.env.FMP_KEY ?? "";
  const { searchParams } = req.nextUrl;

  const params = new URLSearchParams();
  params.set("apikey", key);
  params.set("country", searchParams.get("country") ?? "US");
  params.set("exchange", "NASDAQ,NYSE,AMEX");
  params.set("isActivelyTrading", "true");
  params.set("isEtf", "false");
  params.set("isFund", "false");
  params.set("limit", searchParams.get("limit") ?? "50");

  const sector = searchParams.get("sector");
  const minMarketCap = searchParams.get("minMarketCap");
  const maxMarketCap = searchParams.get("maxMarketCap");
  if (sector) params.set("sector", sector);
  if (minMarketCap) params.set("marketCapMoreThan", minMarketCap);
  if (maxMarketCap) params.set("marketCapLowerThan", maxMarketCap);

  const minPE = searchParams.get("minPE") ? parseFloat(searchParams.get("minPE")!) : null;
  const maxPE = searchParams.get("maxPE") ? parseFloat(searchParams.get("maxPE")!) : null;
  const minNetMargin = searchParams.get("minNetMargin") ? parseFloat(searchParams.get("minNetMargin")!) : null;

  try {
    const res = await fetch(`${BASE}/company-screener?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const base = await res.json();
    if (!Array.isArray(base) || base.length === 0) return NextResponse.json({ results: [] });

    // Enrich with TTM ratios (P/E, net margin, P/S) in parallel
    const enriched = await Promise.all(
      base.slice(0, 50).map(async (c: any) => {
        try {
          const r = await fetch(`${BASE}/ratios-ttm?symbol=${c.symbol}&apikey=${key}`, {
            next: { revalidate: 21600 },
          });
          const ratios = r.ok ? await r.json() : [];
          const rt = Array.isArray(ratios) ? ratios[0] ?? {} : {};
          return {
            symbol: c.symbol,
            companyName: c.companyName,
            sector: c.sector,
            industry: c.industry,
            marketCap: c.marketCap,
            price: c.price,
            beta: c.beta,
            pe: rt.priceToEarningsRatioTTM ?? null,
            ps: rt.priceToSalesRatioTTM ?? null,
            netMargin: rt.netProfitMarginTTM ?? null,
          };
        } catch {
          return {
            symbol: c.symbol, companyName: c.companyName, sector: c.sector,
            industry: c.industry, marketCap: c.marketCap, price: c.price,
            beta: c.beta, pe: null, ps: null, netMargin: null,
          };
        }
      })
    );

    // Apply ratio filters server-side (screener endpoint doesn't support them)
    const results = enriched.filter((r) => {
      if (minPE != null && (r.pe == null || r.pe < minPE)) return false;
      if (maxPE != null && (r.pe == null || r.pe > maxPE)) return false;
      if (minNetMargin != null && (r.netMargin == null || r.netMargin * 100 < minNetMargin)) return false;
      return true;
    });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
