import type { Metadata } from "next";

const DESC =
  "Weekly earnings calendar for the S&P 500 and the broader US market — expected report dates derived from each company's SEC 8-K filing history.";

export const metadata: Metadata = {
  title: "Earnings Calendar — Upcoming Report Dates",
  description: DESC,
  alternates: { canonical: "/earnings" },
  openGraph: {
    title: "Earnings Calendar — Upcoming Report Dates · Prometheon Engine",
    description: DESC,
    url: "https://prometheonengine.com/earnings",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
