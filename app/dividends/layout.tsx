import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dividend History & Yield",
  description: "Complete dividend record with annual growth, yield, payout dates, and consecutive-raise streaks — history going back decades.",
  alternates: { canonical: "/dividends" },
  openGraph: {
    title: "Dividend History & Yield · Prometheon Engine",
    description: "Complete dividend record with annual growth, yield, payout dates, and consecutive-raise streaks — history going back decades.",
    url: "https://prometheonengine.com/dividends",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
