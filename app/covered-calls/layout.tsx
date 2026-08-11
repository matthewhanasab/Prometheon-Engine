import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Covered Call Screener",
  description: "Model covered-call income: a strike ladder with premiums, greeks, assignment probability, and annualized yield for any stock.",
  alternates: { canonical: "/covered-calls" },
  openGraph: {
    title: "Covered Call Screener · Prometheon Engine",
    description: "Model covered-call income: a strike ladder with premiums, greeks, assignment probability, and annualized yield for any stock.",
    url: "https://prometheonengine.com/covered-calls",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
