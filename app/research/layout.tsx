import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stock Research",
  description: "Research any stock: live price, valuation multiples, margins, ROE, free cash flow, analyst ratings, dividends, SEC filings, and a DCF fair value — all on one page.",
  alternates: { canonical: "/research" },
  openGraph: {
    title: "Stock Research · Prometheon Engine",
    description: "Research any stock: live price, valuation multiples, margins, ROE, free cash flow, analyst ratings, dividends, SEC filings, and a DCF fair value — all on one page.",
    url: "https://prometheonengine.com/research",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
