import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Track your holdings with live prices, allocation, dividend income, valuation, and a one-year return race against the S&P 500.",
  alternates: { canonical: "/portfolio" },
  openGraph: {
    title: "Portfolio Tracker · Prometheon Engine",
    description: "Track your holdings with live prices, allocation, dividend income, valuation, and a one-year return race against the S&P 500.",
    url: "https://prometheonengine.com/portfolio",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
