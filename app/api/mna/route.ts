import { NextRequest, NextResponse } from "next/server";
import { guard } from "@/lib/rateLimit";
import snapshot from "@/data/mna.json";

// M&A activity feed, served from the weekly snapshot built by
// scripts/build-mna.mjs. Filtering happens on the page — the whole record is
// a few hundred kilobytes and the filters are instant that way.
export async function GET(req: NextRequest) {
  const limited = guard(req, 2);
  if (limited) return limited;
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=21600, stale-while-revalidate=86400" },
  });
}
