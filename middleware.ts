import { NextRequest, NextResponse } from "next/server";

// Best-effort per-IP rate limit for API routes (per-instance memory —
// good enough to stop casual hammering / quota burn; not a hard guarantee).
const WINDOW_MS = 60_000;
const MAX_REQ = 60; // per IP per minute across all /api routes

const hits = new Map<string, { count: number; start: number }>();

export function middleware(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { count: 1, start: now });
  } else {
    entry.count++;
    if (entry.count > MAX_REQ) {
      return NextResponse.json(
        { error: "Too many requests — slow down." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  // occasional cleanup so the map doesn't grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (now - v.start > WINDOW_MS) hits.delete(k);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
