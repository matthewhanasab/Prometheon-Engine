import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
  }

  const fmpKey = process.env.FMP_KEY;
  if (!fmpKey) {
    return NextResponse.json({ error: "FMP_KEY not configured" }, { status: 500 });
  }

  // FMP is the source of truth (Finnhub's free calendar has large gaps)
  const fmpRes = await fetch(
    `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&apikey=${fmpKey}`,
    { next: { revalidate: 3600 } }
  );
  if (!fmpRes.ok) {
    return NextResponse.json({ error: "FMP request failed" }, { status: 502 });
  }
  const fmpData = await fmpRes.json();

  // Finnhub supplies the report hour (bmo/amc) where it knows it
  const hourMap = new Map<string, string>();
  const fhKey = process.env.FINNHUB_KEY;
  if (fhKey) {
    try {
      const fhRes = await fetch(
        `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${fhKey}`,
        { next: { revalidate: 3600 } }
      );
      if (fhRes.ok) {
        const fhData = await fhRes.json();
        for (const e of fhData.earningsCalendar ?? []) {
          if (e.symbol && e.date && e.hour) hourMap.set(`${e.symbol}|${e.date}`, e.hour);
        }
      }
    } catch { /* hour labels are best-effort */ }
  }

  const earnings = (Array.isArray(fmpData) ? fmpData : [])
    // keep plain US-style symbols; drop foreign listings like 0700.HK or RY.TO
    .filter((e: any) => e.symbol && /^[A-Z]+(-[A-Z])?$/.test(e.symbol))
    .map((e: any) => ({
      symbol: e.symbol,
      date: e.date,
      hour: hourMap.get(`${e.symbol}|${e.date}`) ?? "",
      epsActual: e.epsActual ?? null,
      epsEstimate: e.epsEstimated ?? null,
    }));

  return NextResponse.json({ earnings, from, to });
}
