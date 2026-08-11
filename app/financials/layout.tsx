import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Financial Statements",
  description: "Full income statement, balance sheet, and cash-flow statement for any company — annual and quarterly, as filed with the SEC.",
  alternates: { canonical: "/financials" },
  openGraph: {
    title: "Financial Statements · Prometheon Engine",
    description: "Full income statement, balance sheet, and cash-flow statement for any company — annual and quarterly, as filed with the SEC.",
    url: "https://prometheonengine.com/financials",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
