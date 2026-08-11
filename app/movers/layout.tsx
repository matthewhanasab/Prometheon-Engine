import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Movers",
  description: "Today's biggest gainers, losers, and most-active stocks, plus a market-wide overview of indices, futures, and forex.",
  alternates: { canonical: "/movers" },
  openGraph: {
    title: "Market Movers · Prometheon Engine",
    description: "Today's biggest gainers, losers, and most-active stocks, plus a market-wide overview of indices, futures, and forex.",
    url: "https://prometheonengine.com/movers",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
