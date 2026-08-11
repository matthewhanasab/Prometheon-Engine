import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Stocks",
  description: "Compare up to five stocks side by side across valuation, growth, profitability, and balance-sheet health, with a category-by-category scorecard.",
  alternates: { canonical: "/compare" },
  openGraph: {
    title: "Compare Stocks · Prometheon Engine",
    description: "Compare up to five stocks side by side across valuation, growth, profitability, and balance-sheet health, with a category-by-category scorecard.",
    url: "https://prometheonengine.com/compare",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
