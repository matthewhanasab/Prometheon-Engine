import type { Metadata } from "next";

const DESC =
  "Deal-by-deal record of acquisitions, buyouts and IPOs — acquirer, target, value, dates and advisors, filterable by industry.";

export const metadata: Metadata = {
  title: "M&A Activity — Deals by Industry",
  description: DESC,
  alternates: { canonical: "/mna" },
  openGraph: {
    title: "M&A Activity — Deals by Industry · Prometheon Engine",
    description: DESC,
    url: "https://prometheonengine.com/mna",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
