import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financial Charts",
  description: "Ten years of revenue, EPS, operating cash flow, margins, free cash flow, and historical P/E and P/S — charted quarterly and annually from SEC filings.",
  alternates: { canonical: "/charts" },
  openGraph: {
    title: "Financial Charts · Prometheon Engine",
    description: "Ten years of revenue, EPS, operating cash flow, margins, free cash flow, and historical P/E and P/S — charted quarterly and annually from SEC filings.",
    url: "https://prometheonengine.com/charts",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
