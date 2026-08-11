import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ETF Hub — Holdings & Allocation",
  description:
    "Look inside any ETF: full holdings with weights, country and asset allocation, net assets, price and dividend yield — holdings sourced from SEC N-PORT filings.",
  alternates: { canonical: "/etf" },
  openGraph: {
    title: "ETF Hub — Holdings & Allocation · Prometheon Engine",
    description:
      "Full ETF holdings with weights, country and asset allocation, net assets, price and yield.",
    url: "https://prometheonengine.com/etf",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
