import { NextRequest, NextResponse } from "next/server";

// Same-origin proxy for FMP's company logos. The share-card canvas draws this,
// and a cross-origin image would taint the canvas and break PNG export — routing
// it through our own origin keeps the canvas clean.
export const revalidate = 86400;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const t = ticker.toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12);
  try {
    const res = await fetch(`https://images.financialmodelingprep.com/symbol/${t}.png`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return new NextResponse(null, { status: 404 });
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
