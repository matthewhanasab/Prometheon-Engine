import type { MetadataRoute } from "next";

const BASE = "https://prometheonengine.com";

// Public, indexable routes. The "Not available with current data" placeholder
// pages (etf, fairvalue, projections) are intentionally excluded —
// they're thin content and marked noindex in their layouts.
const ROUTES: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, freq: "weekly" },
  { path: "/research", priority: 0.9, freq: "daily" },
  { path: "/compare", priority: 0.8, freq: "daily" },
  { path: "/charts", priority: 0.8, freq: "daily" },
  { path: "/financials", priority: 0.8, freq: "daily" },
  { path: "/dividends", priority: 0.7, freq: "daily" },
  { path: "/earnings", priority: 0.7, freq: "daily" },
  { path: "/screener", priority: 0.7, freq: "daily" },
  { path: "/etf", priority: 0.8, freq: "daily" },
  { path: "/etf/compare", priority: 0.7, freq: "daily" },
  { path: "/macro", priority: 0.7, freq: "daily" },
  { path: "/movers", priority: 0.6, freq: "hourly" },
  { path: "/insider", priority: 0.6, freq: "daily" },
  { path: "/congress", priority: 0.6, freq: "daily" },
  { path: "/sec", priority: 0.6, freq: "daily" },
  { path: "/options-chain", priority: 0.7, freq: "hourly" },
  { path: "/covered-calls", priority: 0.6, freq: "daily" },
  { path: "/puts", priority: 0.6, freq: "daily" },
  { path: "/portfolio", priority: 0.6, freq: "weekly" },
  { path: "/calculator", priority: 0.5, freq: "monthly" },
];

// A handful of popular tickers get deep-linked research URLs so search engines
// have concrete example pages to crawl and rank for "<ticker> stock" queries.
const POPULAR = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "KO", "JPM", "SPY"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const core = ROUTES.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));
  const tickers = POPULAR.map((t) => ({
    url: `${BASE}/research?ticker=${t}`,
    lastModified: now,
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));
  return [...core, ...tickers];
}
