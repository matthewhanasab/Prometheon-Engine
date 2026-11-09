import type { Metadata } from "next";

export const metadata: Metadata = {
  // Absolute: the "· Prometheon Engine" suffix is a template on the root
  // layout, and it does not reach through /etf's own title to this page.
  title: { absolute: "Compare ETFs — Holdings Overlap & Returns · Prometheon Engine" },
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
