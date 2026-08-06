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

async function fetchLatestFred(series: string): Promise<number | null> {
  const key = process.env.FRED_KEY ?? "";
  const params = new URLSearchParams({
    series_id: series,
    api_key: key,
    file_type: "json",
    sort_order: "desc",
    limit: "5",
  });
  try {
    const res = await fetch(`${FRED}?${params}`, { next: { revalidate: 21600 } });
    const data = await res.json();
    const obs = (data.observations ?? []).find((o: { value: string }) => o.value !== ".");
    return obs ? parseFloat(obs.value) : null;
  } catch { return null; }
}

// Index/commodity tracker quotes via marketstack (SPY, QQQ, GLD, USO, UUP).
// Bitcoin was sourced from the old quote provider; marketstack carries no
// crypto, so BTCUSD is simply absent and the page skips its card.
async function fetchMarkets(): Promise<any[]> {
  const key = process.env.MARKETSTACK_KEY ?? "";
  if (!key) return [];
  const syms = ["SPY", "QQQ", "GLD", "USO", "UUP"];
  const out: any[] = [];
  for (const s of syms) {
    try {
      const res = await fetch(
        `https://api.marketstack.com/v2/eod?access_key=${key}&symbols=${s}&limit=2`,
        { next: { revalidate: 21600 } }
      );
      const j = await res.json().catch(() => null);
      const rows = (Array.isArray(j?.data) ? j.data : []).filter((r: any) => Number(r?.close) > 0);
      if (!rows.length) continue;
      const price = Number(rows[0].close);
      const prev = rows[1] ? Number(rows[1].close) : null;
      const pct = prev ? ((price - prev) / prev) * 100 : null;
      out.push({
        symbol: s,
        price,
        // Both field spellings: the macro page reads changesPercentage, the
        // home ticker tape reads changePct.
        changesPercentage: pct,
        changePct: pct,
      });
    } catch { /* skip symbol */ }
  }
  return out;
}

export async function GET() {

  const YIELD_SERIES = [
    { label: "1M", series: "DGS1MO", maturity: 1/12 },
    { label: "3M", series: "DGS3MO", maturity: 3/12 },
    { label: "6M", series: "DGS6MO", maturity: 6/12 },
    { label: "1Y", series: "DGS1",   maturity: 1 },
    { label: "2Y", series: "DGS2",   maturity: 2 },
    { label: "3Y", series: "DGS3",   maturity: 3 },
    { label: "5Y", series: "DGS5",   maturity: 5 },
    { label: "7Y", series: "DGS7",   maturity: 7 },
    { label: "10Y", series: "DGS10", maturity: 10 },
    { label: "20Y", series: "DGS20", maturity: 20 },
    { label: "30Y", series: "DGS30", maturity: 30 },
  ];

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
    fearGreedRes,
    ...yieldValues
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
    fetchMarkets(),
    fetch("https://api.alternative.me/fng/?limit=30", { next: { revalidate: 21600 } }),
    ...YIELD_SERIES.map((s) => fetchLatestFred(s.series)),
  ]);

  const markets = marketsRes;
  const spread = spreadRaw.slice(-300);
  const cpiYoy = computeYoY(cpiRaw);
  const pceYoy = computeYoY(pceRaw);

  // Build yield curve
  const yieldCurve = YIELD_SERIES.map((s, i) => ({
    label: s.label,
    maturity: s.maturity,
    value: yieldValues[i] as number | null,
  })).filter((p) => p.value != null);

  // Fear & Greed
  let fearGreed = null;
  try {
    const fgData = await fearGreedRes.json();
    const entries = fgData?.data ?? [];
    fearGreed = {
      value: entries[0] ? parseInt(entries[0].value) : null,
      classification: entries[0]?.value_classification ?? null,
      history: entries.map((e: { timestamp: string; value: string }) => ({
        timestamp: e.timestamp,
        value: parseInt(e.value),
      })).reverse(),
    };
  } catch { /* leave null */ }

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
    yieldCurve,
    fearGreed,
  });
}
