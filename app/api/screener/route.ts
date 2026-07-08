import { NextRequest, NextResponse } from "next/server";

const BASE = "https://financialmodelingprep.com/stable";

function num(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

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
  params.set("limit", searchParams.get("limit") ?? "60");

  // Filters FMP supports natively
  const sector = searchParams.get("sector");
  const minMarketCap = searchParams.get("minMarketCap");
  const maxMarketCap = searchParams.get("maxMarketCap");
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const maxBeta = searchParams.get("maxBeta");
  if (sector) params.set("sector", sector);
  if (minMarketCap) params.set("marketCapMoreThan", minMarketCap);
  if (maxMarketCap) params.set("marketCapLowerThan", maxMarketCap);
  if (minPrice) params.set("priceMoreThan", minPrice);
  if (maxPrice) params.set("priceLowerThan", maxPrice);
  if (maxBeta) params.set("betaLowerThan", maxBeta);

  // Ratio filters applied after enrichment
  const minPE = num(searchParams.get("minPE"));
  const maxPE = num(searchParams.get("maxPE"));
  const maxPS = num(searchParams.get("maxPS"));
  const maxPB = num(searchParams.get("maxPB"));
  const maxDE = num(searchParams.get("maxDE"));
  const minNetMargin = num(searchParams.get("minNetMargin"));       // %
  const minGrossMargin = num(searchParams.get("minGrossMargin"));   // %
  const minDivYield = num(searchParams.get("minDivYield"));         // %
  const minCurrentRatio = num(searchParams.get("minCurrentRatio"));

  try {
    const res = await fetch(`${BASE}/company-screener?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ results: [] });
    const base = await res.json();
    if (!Array.isArray(base) || base.length === 0) return NextResponse.json({ results: [] });

    // Enrich with TTM ratios in parallel
    const enriched = await Promise.all(
      base.slice(0, 60).map(async (c: any) => {
        let rt: any = {};
        try {
          const r = await fetch(`${BASE}/ratios-ttm?symbol=${c.symbol}&apikey=${key}`, {
            next: { revalidate: 21600 },
          });
          const ratios = r.ok ? await r.json() : [];
          rt = Array.isArray(ratios) ? ratios[0] ?? {} : {};
        } catch { /* leave empty */ }
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
          pb: rt.priceToBookRatioTTM ?? null,
          de: rt.debtToEquityRatioTTM ?? null,
          netMargin: rt.netProfitMarginTTM ?? null,
          grossMargin: rt.grossProfitMarginTTM ?? null,
          divYield: rt.dividendYieldTTM ?? null,
          currentRatio: rt.currentRatioTTM ?? null,
        };
      })
    );

    const results = enriched.filter((r) => {
      if (minPE != null && (r.pe == null || r.pe < minPE)) return false;
      if (maxPE != null && (r.pe == null || r.pe > maxPE)) return false;
      if (maxPS != null && (r.ps == null || r.ps > maxPS)) return false;
      if (maxPB != null && (r.pb == null || r.pb > maxPB)) return false;
      if (maxDE != null && (r.de == null || r.de > maxDE)) return false;
      if (minNetMargin != null && (r.netMargin == null || r.netMargin * 100 < minNetMargin)) return false;
      if (minGrossMargin != null && (r.grossMargin == null || r.grossMargin * 100 < minGrossMargin)) return false;
      if (minDivYield != null && (r.divYield == null || r.divYield * 100 < minDivYield)) return false;
      if (minCurrentRatio != null && (r.currentRatio == null || r.currentRatio < minCurrentRatio)) return false;
      return true;
    });

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
