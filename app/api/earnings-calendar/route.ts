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

  // FMP is the source of truth (Finnhub's free calendar has large gaps), but its
  // earnings-calendar caps at 4000 rows and silently drops the EARLIEST dates when
  // the range is too wide — a full month loses its first two weeks. Fetch in
  // weekly chunks (a peak week is ~2500 rows, well under the cap) and merge.
  const chunks: [string, string][] = [];
  {
    const end = new Date(`${to}T00:00:00Z`);
    let start = new Date(`${from}T00:00:00Z`);
    let guard = 0;
    while (start <= end && guard++ < 20) {
      const chunkEnd = new Date(start);
      chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 6);
      const cEnd = chunkEnd > end ? end : chunkEnd;
      chunks.push([start.toISOString().slice(0, 10), cEnd.toISOString().slice(0, 10)]);
      start = new Date(cEnd);
      start.setUTCDate(start.getUTCDate() + 1);
    }
  }

  const chunkResults = await Promise.all(
    chunks.map(([cf, ct]) =>
      fetch(
        `https://financialmodelingprep.com/stable/earnings-calendar?from=${cf}&to=${ct}&apikey=${fmpKey}`,
        { next: { revalidate: 3600 } }
      )
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => [])
    )
  );
  const fmpData = chunkResults.flat();

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
