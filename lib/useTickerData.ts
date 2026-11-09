"use client";
import { useCallback, useEffect, useState } from "react";

// Loads the data for the ticker a page is showing, the same way on every
// company page:
//
//   - the previous company stays on screen (flagged `stale`) while the next
//     one loads, so a lookup never blanks the page;
//   - a response that arrives after the visitor has moved on is dropped;
//   - a failure is reported with a way to retry, and never as a blank page.
//
// Results are also remembered for the visit, so going back to a company seen
// a moment ago is instant and is quietly refreshed behind the scenes.

type Entry<T> = { ticker: string; path: string; data: T };

const memory = new Map<string, unknown>();

export function useTickerData<T = unknown>(
  ticker: string | null,
  /** Request path for a ticker, e.g. (t) => `/api/ms-charts/${t}`. */
  url: (ticker: string) => string,
): {
  /** The newest data in hand; may belong to the previous ticker while `stale`. */
  data: T | null;
  /** The ticker `data` belongs to. */
  shown: string | null;
  /** A request for the current ticker is in flight. */
  loading: boolean;
  /** `loading`, with older data still on screen. */
  stale: boolean;
  error: string | null;
  retry: () => void;
} {
  const [entry, setEntry] = useState<Entry<T> | null>(null);
  const [failed, setFailed] = useState<{ path: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const path = ticker ? url(ticker) : null;

  useEffect(() => {
    if (!ticker || !path) return;
    let alive = true;
    const cached = memory.get(path) as T | undefined;
    // Show the remembered copy at once; the request below still refreshes it.
    // Deferred a tick so the update is not made synchronously inside the effect.
    const show = cached !== undefined
      ? setTimeout(() => { if (alive) { setEntry({ ticker, path, data: cached }); setFailed(null); } }, 0)
      : null;
    fetch(path)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok || !json || json.error) throw new Error(json?.error ?? `Request failed (${res.status})`);
        memory.set(path, json);
        if (memory.size > 40) memory.delete(memory.keys().next().value as string);
        if (alive) { setEntry({ ticker, path, data: json as T }); setFailed(null); }
      })
      .catch((e: unknown) => {
        if (alive && cached === undefined) setFailed({ path, message: e instanceof Error ? e.message : "Request failed" });
      });
    return () => { alive = false; if (show) clearTimeout(show); };
  }, [ticker, path, attempt]);

  const error = failed && failed.path === path ? failed.message : null;
  const current = entry != null && entry.path === path;
  const loading = !!ticker && !error && !current;
  const retry = useCallback(() => { setFailed(null); setAttempt((n) => n + 1); }, []);

  return {
    data: error ? null : entry?.data ?? null,
    shown: error ? null : entry?.ticker ?? null,
    loading,
    stale: loading && entry != null,
    error,
    retry,
  };
}

/** Plain-language reason for a failed lookup. */
export function lookupErrorText(error: string): string {
  return /not found|no data|unknown|invalid|404/i.test(error)
    ? "That symbol isn't in the data. Check the spelling, or search by company name."
    : /429|rate|too many/i.test(error)
    ? "Too many requests in a short time. Wait a moment and try again."
    : "The data service didn't answer. This is usually momentary.";
}
