import { NextResponse } from "next/server";

const FRED = "https://api.stlouisfed.org/fred/series/observations";

async function fetchFred(
  series: string,
  extra: Record<string, string> = {}
): Promise<{ date: string; value: number }[]> {
  const key = process.env.FRED_KEY ?? "";
  const params = new URLSearchParams({
    series_id: series,
    api_key: key,
    file_type: "json",
    sort_order: "asc",
    limit: "60",
    observation_start: "2018-01-01",
    ...extra,
  });
  const res = await fetch(`${FRED}?${params}`, { next: { revalidate: 21600 } });
  const data = await res.json();
  return (data.observations ?? [])
    .map((o: { date: string; value: string }) => ({
      date: o.date,
      value: parseFloat(o.value),
    }))
    .filter((o: { date: string; value: number }) => !isNaN(o.value));
}

function computeYoY(
  data: { date: string; value: number }[]
): { date: string; value: number }[] {
  return data
    .map((item, i) => {
      const priorDate = new Date(item.date);
      priorDate.setFullYear(priorDate.getFullYear() - 1);
      const priorStr = priorDate.toISOString().slice(0, 7);
      // find closest prior entry within that month
      const prior = data
        .slice(0, i)
        .reverse()
        .find((d) => d.date.startsWith(priorStr));
      if (!prior) return null;
      return {
        date: item.date,
        value: ((item.value - prior.value) / prior.value) * 100,
      };
    })
    .filter(Boolean) as { date: string; value: number }[];
}

export async function GET() {
  const fmpKey = process.env.FMP_KEY ?? "";

  const [
    ffr,
    gs10,
    gs2,
    spreadRaw,
    cpiRaw,
    pceRaw,
    bei,
    unemp,
    claims,
    sentiment,
    vix,
    marketsRes,
  ] = await Promise.all([
    fetchFred("FEDFUNDS"),
    fetchFred("GS10"),
    fetchFred("GS2"),
    fetchFred("T10Y2Y", { limit: "500" }),
    fetchFred("CPIAUCSL", { limit: "120" }),
    fetchFred("PCEPI", { limit: "120" }),
    fetchFred("T10YIE"),
    fetchFred("UNRATE"),
    fetchFred("ICSA"),
    fetchFred("UMCSENT"),
    fetchFred("VIXCLS", { limit: "500" }),
    fetch(
      `https://financialmodelingprep.com/api/v3/quote/SPY,QQQ,GLD,USO,BTCUSD,UUP?apikey=${fmpKey}`,
      { next: { revalidate: 21600 } }
    ),
  ]);

  const markets = await marketsRes.json();
  const spread = spreadRaw.slice(-300);
  const cpiYoy = computeYoY(cpiRaw);
  const pceYoy = computeYoY(pceRaw);

  return NextResponse.json({
    fred: {
      ffr,
      gs10,
      gs2,
      spread,
      cpiYoy,
      pceYoy,
      bei,
      unemp,
      claims,
      sentiment,
      vix: vix.slice(-300),
    },
    markets: Array.isArray(markets) ? markets : [],
  });
}
