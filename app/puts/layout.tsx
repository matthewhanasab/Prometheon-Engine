import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cash-Secured Put Screener",
  description: "Model cash-secured puts: entry discount, assignment odds, premium income, and yield on capital at risk for any stock.",
  alternates: { canonical: "/puts" },
  openGraph: {
    title: "Cash-Secured Put Screener · Prometheon Engine",
    description: "Model cash-secured puts: entry discount, assignment odds, premium income, and yield on capital at risk for any stock.",
    url: "https://prometheonengine.com/puts",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
