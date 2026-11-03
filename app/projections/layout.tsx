import type { Metadata } from "next";

const DESC =
  "Bull, base and bear five-year scenarios for any stock — editable EPS growth and exit multiples, seeded from analyst consensus and the filed trend.";

export const metadata: Metadata = {
  title: "Projections — Bull, Base & Bear Scenarios",
  description: DESC,
  alternates: { canonical: "/projections" },
  openGraph: {
    title: "Projections — Bull, Base & Bear Scenarios · Prometheon Engine",
    description: DESC,
    url: "https://prometheonengine.com/projections",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
