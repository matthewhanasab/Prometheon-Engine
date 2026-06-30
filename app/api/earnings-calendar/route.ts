import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });
  }

  const key = process.env.FINNHUB_KEY;
  if (!key) {
    return NextResponse.json({ error: "FINNHUB_KEY not configured" }, { status: 500 });
  }

  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return NextResponse.json({ error: "Finnhub request failed" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ earnings: data.earningsCalendar ?? [], from, to });
}
