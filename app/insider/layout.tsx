import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insider Trading — SEC Form 4",
  description: "Recent insider buys and sells parsed straight from SEC Form 4 filings: who traded, how many shares, and at what value.",
  alternates: { canonical: "/insider" },
  openGraph: {
    title: "Insider Trading — SEC Form 4 · Prometheon Engine",
    description: "Recent insider buys and sells parsed straight from SEC Form 4 filings: who traded, how many shares, and at what value.",
    url: "https://prometheonengine.com/insider",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
