import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare ETFs — Holdings Overlap & Returns",
  description:
    "Compare ETFs side by side: yield, returns, concentration, and how much they hold in common. See whether two funds are truly diversifying or the same basket twice.",
  alternates: { canonical: "/etf/compare" },
  openGraph: {
    title: "Compare ETFs — Holdings Overlap & Returns · Prometheon Engine",
    description: "Side-by-side ETF yield, returns, concentration, and holdings overlap.",
    url: "https://prometheonengine.com/etf/compare",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
