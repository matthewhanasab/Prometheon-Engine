const KEY = process.env.FINNHUB_KEY!;
const BASE = "https://finnhub.io/api/v1";

async function get(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set("token", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function getFinnhubRecommendations(ticker: string) {
  const data = await get("/stock/recommendation", { symbol: ticker });
  if (!Array.isArray(data) || data.length === 0) return null;
  return data.slice(0, 6);
}

export async function getFinnhubNews(ticker: string) {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const data = await get("/company-news", { symbol: ticker, from, to });
  if (!Array.isArray(data)) return [];
  return data.slice(0, 10);
}

export async function getFinnhubPriceTarget(ticker: string): Promise<number | null> {
  const data = await get("/stock/price-target", { symbol: ticker });
  if (!data) return null;
  return data.targetMean ?? data.targetMedian ?? null;
}
