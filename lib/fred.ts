export async function get10YTreasury(): Promise<number | null> {
  const KEY = process.env.FRED_KEY;
  if (!KEY) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${KEY}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const data = await res.json();
    const val = parseFloat(data?.observations?.[0]?.value ?? "");
    return isNaN(val) ? null : val / 100;
  } catch { return null; }
}
