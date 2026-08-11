import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Earnings — Reported Results & Calendar",
  description: "Reported EPS, revenue, and net income by quarter with year-over-year growth, plus the upcoming earnings and economic calendar.",
  alternates: { canonical: "/earnings" },
  openGraph: {
    title: "Earnings — Reported Results & Calendar · Prometheon Engine",
    description: "Reported EPS, revenue, and net income by quarter with year-over-year growth, plus the upcoming earnings and economic calendar.",
    url: "https://prometheonengine.com/earnings",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
