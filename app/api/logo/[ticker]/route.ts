import { NextRequest, NextResponse } from "next/server";

// Company logo, same-origin (canvas-safe for the share cards).
//
// Sourced from the company's own website favicon: marketstack's tickerinfo
// carries the website URL, and Google's favicon service resolves a high-res
// icon for any domain. Falls back through DuckDuckGo's icon service before
// 404ing, at which point CompanyLogo hides the tile.
export const revalidate = 86400;

const MS = "https://api.marketstack.com/v2";

async function fetchIcon(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    // Placeholder globes from these services are tiny; treat them as misses.
    if (buf.byteLength < 200) return null;
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  const key = process.env.MARKETSTACK_KEY;
  if (!key) return new NextResponse(null, { status: 404 });

  try {
    const res = await fetch(`${MS}/tickerinfo?access_key=${key}&ticker=${t}`, {
      next: { revalidate: 86400 },
    });
    const j = await res.json().catch(() => null);
    const info = Array.isArray(j?.data) ? j.data[0] : j?.data;
    const website: string | undefined = info?.website;
    if (!website) return new NextResponse(null, { status: 404 });
    const domain = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;

    return (
      (await fetchIcon(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)) ??
      (await fetchIcon(`https://icons.duckduckgo.com/ip3/${domain}.ico`)) ??
      new NextResponse(null, { status: 404 })
    );
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
