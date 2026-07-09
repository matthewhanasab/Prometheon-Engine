import { NextResponse } from "next/server";

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

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET() {
  const key = process.env.FMP_KEY ?? "";
  try {
    const [gainers, losers, actives] = await Promise.all([
      fetchJson(`${FMP_BASE}/biggest-gainers?apikey=${key}`, 900),
      fetchJson(`${FMP_BASE}/biggest-losers?apikey=${key}`, 900),
      fetchJson(`${FMP_BASE}/most-actives?apikey=${key}`, 900),
    ]);

    // Sector performance: today, fall back to yesterday (weekends/holidays: go back up to 5 days)
    let sectors: any[] = [];
    for (let back = 0; back < 5 && sectors.length === 0; back++) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      sectors = await fetchJson(
        `${FMP_BASE}/sector-performance-snapshot?date=${toYMD(d)}&apikey=${key}`,
        1800
      );
    }

    // Dedupe sectors by name (multiple exchanges) — average the averageChange
    const bySector = new Map<string, { sum: number; n: number; date: string }>();
    for (const row of sectors) {
      if (!row?.sector || row.averageChange == null) continue;
      const cur = bySector.get(row.sector) ?? { sum: 0, n: 0, date: row.date ?? "" };
      cur.sum += Number(row.averageChange);
      cur.n += 1;
      cur.date = row.date ?? cur.date;
      bySector.set(row.sector, cur);
    }
    const sectorPerf = Array.from(bySector.entries())
      .map(([sector, v]) => ({ sector, averageChange: v.sum / v.n, date: v.date }))
      .sort((a, b) => b.averageChange - a.averageChange);

    return NextResponse.json({
      gainers: gainers.slice(0, 15),
      losers: losers.slice(0, 15),
      actives: actives.slice(0, 15),
      sectors: sectorPerf,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to fetch market movers" }, { status: 500 });
  }
}
