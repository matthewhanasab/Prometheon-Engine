import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Screener",
  description: "Screen the whole market by valuation, performance, dividends, margins, and technicals across major exchanges.",
  alternates: { canonical: "/screener" },
  openGraph: {
    title: "Stock Screener · Prometheon Engine",
    description: "Screen the whole market by valuation, performance, dividends, margins, and technicals across major exchanges.",
    url: "https://prometheonengine.com/screener",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
