import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compound Interest Calculator",
  description: "Project investment growth over time with compound interest, recurring contributions, and adjustable rate assumptions.",
  alternates: { canonical: "/calculator" },
  openGraph: {
    title: "Compound Interest Calculator · Prometheon Engine",
    description: "Project investment growth over time with compound interest, recurring contributions, and adjustable rate assumptions.",
    url: "https://prometheonengine.com/calculator",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
