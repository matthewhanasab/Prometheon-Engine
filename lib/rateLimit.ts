import { NextRequest, NextResponse } from "next/server";

// Cost-weighted per-IP rate limiter, enforced inside the Node route handlers.
//
// Why here and not in middleware: Next.js middleware runs in the Edge runtime,
// where module-level state does NOT persist across invocations — an in-memory
// counter there resets every request and never limits anything. Node serverless
// instances DO reuse global scope while warm, so a module-level Map works.
// Best-effort per-instance (multiple warm instances each keep their own tally),
// but it makes scripted quota-burn expensive instead of free.
//
// The data provider is metered and billed per call, and one research request
// fans out to ~11 upstream calls, so the budget is denominated in "upstream
// cost units" rather than request count — otherwise distinct-ticker enumeration
// slips under a flat cap while draining the quota.
const WINDOW_MS = 60_000;
const BUDGET = 220; // cost units per IP per minute

type Entry = { cost: number; start: number };
const hits: Map<string, Entry> =
  ((globalThis as any).__rlHits ??= new Map<string, Entry>());

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Charge `cost` against the caller's budget. Returns a 429 response when the
 * budget is spent, or null to proceed.
 *
 * In-process calls (constructed with the internal.local host, e.g. from the
 * portfolio aggregator) are exempt — they're already gated by the outer
 * request's guard, and an external client cannot forge that hostname.
 */
export function guard(req: NextRequest, cost: number): NextResponse | null {
  if (req.nextUrl.hostname === "internal.local") return null;

  const now = Date.now();
  const ip = clientIp(req);
  let e = hits.get(ip);
  if (!e || now - e.start > WINDOW_MS) {
    e = { cost: 0, start: now };
    hits.set(ip, e);
  }
  e.cost += cost;

  if (e.cost > BUDGET) {
    const retry = Math.max(1, Math.ceil((WINDOW_MS - (now - e.start)) / 1000));
    return NextResponse.json(
      { error: "Too many requests — slow down." },
      { status: 429, headers: { "Retry-After": String(retry) } }
    );
  }

  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  }
  return null;
}
