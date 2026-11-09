"use client";
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// The ticker a page is showing lives in its address (?ticker=AAPL), not only
// in component state. That makes every company view a link that can be shared
// or bookmarked, lets Back and Forward walk through the companies just viewed,
// and lets the search menu send a new ticker to the page already open.
//
// Returns the ticker from the address (or the fallback) and a setter that
// navigates. Callers must sit under a <Suspense> boundary, as with any use of
// useSearchParams.
export function useUrlTicker(fallback: string | null = null, param = "ticker"): [string | null, (t: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const raw = search.get(param);
  const ticker = raw ? raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 12) || fallback : fallback;

  const setTicker = useCallback((next: string) => {
    const t = next.trim().toUpperCase();
    if (!t) return;
    const params = new URLSearchParams(search.toString());
    params.set(param, t);
    // scroll: false — the page updates in place; jumping to the top on every
    // lookup would throw away where the visitor was reading.
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, search, param]);

  return [ticker, setTicker];
}
