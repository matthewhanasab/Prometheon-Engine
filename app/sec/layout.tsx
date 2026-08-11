import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SEC Filings",
  description: "Recent SEC filings for any company — 10-K, 10-Q, 8-K, proxy statements, and Form 4 insider reports, linked to the source documents.",
  alternates: { canonical: "/sec" },
  openGraph: {
    title: "SEC Filings · Prometheon Engine",
    description: "Recent SEC filings for any company — 10-K, 10-Q, 8-K, proxy statements, and Form 4 insider reports, linked to the source documents.",
    url: "https://prometheonengine.com/sec",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
