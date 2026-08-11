import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Macro Dashboard",
  description: "Interest rates, inflation, the Treasury yield curve, unemployment, jobless claims, and the fear & greed index — the market backdrop at a glance.",
  alternates: { canonical: "/macro" },
  openGraph: {
    title: "Macro Dashboard · Prometheon Engine",
    description: "Interest rates, inflation, the Treasury yield curve, unemployment, jobless claims, and the fear & greed index — the market backdrop at a glance.",
    url: "https://prometheonengine.com/macro",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
