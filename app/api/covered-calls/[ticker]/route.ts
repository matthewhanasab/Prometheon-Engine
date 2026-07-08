import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/fmp";

const FMP = "https://financialmodelingprep.com/stable";

async function fmpGet(path: string, params: Record<string, string>) {
  const key = process.env.FMP_KEY ?? "";
  const url = new URL(`${FMP}${path}`);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getFred3M(): Promise<number | null> {
  const key = process.env.FRED_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DGS3MO&api_key=${key}&file_type=json&sort_order=desc&limit=5`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data.observations ?? []).find((o: any) => o.value !== ".");
    return obs ? parseFloat(obs.value) / 100 : null;
  } catch { return null; }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase();

  try {
    const [quoteRaw, history, rfr, earningsRaw] = await Promise.all([
      fmpGet("/quote", { symbol: t }),
      getPriceHistory(t, 365),
      getFred3M(),
      fmpGet("/earnings", { symbol: t, limit: "8" }),
    ]);

    const q = Array.isArray(quoteRaw) ? quoteRaw[0] : null;
    if (!q?.price) {
      return NextResponse.json({ error: "Ticker not found" }, { status: 404 });
    }

    // 21-day historical volatility, annualized — drives the IV estimate
    let hv21: number | null = null;
    if (history.length > 30) {
      const closes = history.map((h: any) => h.price).filter((p: number) => p > 0);
      const rets: number[] = [];
      for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
      const recent = rets.slice(-21);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      const variance = recent.reduce((a, b) => a + (b - mean) ** 2, 0) / (recent.length - 1);
      hv21 = Math.sqrt(variance) * Math.sqrt(252);
    }

    // 1y HV range for IV-rank context
    let hvRank: number | null = null;
    if (history.length > 60 && hv21 != null) {
      const closes = history.map((h: any) => h.price).filter((p: number) => p > 0);
      const rets: number[] = [];
      for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
      const rolling: number[] = [];
      for (let i = 21; i <= rets.length; i++) {
        const win = rets.slice(i - 21, i);
        const m = win.reduce((a, b) => a + b, 0) / win.length;
        const v = win.reduce((a, b) => a + (b - m) ** 2, 0) / (win.length - 1);
        rolling.push(Math.sqrt(v) * Math.sqrt(252));
      }
      const lo = Math.min(...rolling), hi = Math.max(...rolling);
      hvRank = hi > lo ? Math.max(0, Math.min(100, ((hv21 - lo) / (hi - lo)) * 100)) : 50;
    }

    // Next earnings date (first one today or later)
    const today = new Date().toISOString().slice(0, 10);
    let nextEarnings: string | null = null;
    if (Array.isArray(earningsRaw)) {
      const future = earningsRaw
        .map((e: any) => e.date)
        .filter((d: string) => d && d >= today)
        .sort();
      nextEarnings = future[0] ?? null;
    }

    return NextResponse.json({
      ticker: t,
      name: q.name ?? t,
      price: q.price,
      week52High: q.yearHigh ?? null,
      week52Low: q.yearLow ?? null,
      hv21,
      hvRank,
      rfr: rfr ?? 0.045,
      nextEarnings,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
